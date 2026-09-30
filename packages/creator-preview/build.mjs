/** Build an explicitly supplied, pinned creator checkout into ignored artifacts. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { rewriteImports } from './imports.mjs';
export const root = new URL('../../', import.meta.url);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const flat = (p) => p.replaceAll('/', '--');
export function replaceRequired(code, from, to) {
  if (!code.includes(from))
    throw new Error('Creator source patch no longer applies');
  return code.replace(from, to);
}
export function buildCreator({
  id,
  revision,
  title,
  patch,
  assets = [],
  exclude = [],
}) {
  const source = process.argv[2];
  if (!source)
    throw new Error('Pass the path to the authorized creator checkout');
  const git = (args) =>
    execFileSync('git', ['-C', resolve(source), ...args], {
      maxBuffer: 32 * 1024 * 1024,
    });
  if (git(['rev-parse', 'HEAD']).toString().trim() !== revision)
    throw new Error('Unexpected creator source revision');
  if (git(['status', '--porcelain', '--untracked-files=no']).length)
    throw new Error('Creator checkout has uncommitted changes');
  const remote = git(['remote', 'get-url', 'origin']).toString().trim();
  const sourceUrl = remote
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(sourceUrl))
    throw new Error('Unsupported creator remote');
  const paths = git(['ls-tree', '-r', '--name-only', revision])
    .toString()
    .trim()
    .split('\n');
  const out = new URL(`../../dist/${id}/`, import.meta.url);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const selected = [];
  const put = (name, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name))
      throw new Error('Unsafe artifact name');
    writeFileSync(new URL(name, out), bytes);
  };
  const read = (p, binary = false) => {
    const b = git(['show', `${revision}:${p}`]);
    selected.push({ path: p, sha256: hash(b) });
    return binary ? b : b.toString();
  };
  for (const p of assets) {
    if (!paths.includes(p) || !p.startsWith('client/assets/'))
      throw new Error('Invalid creator asset');
    put(flat(p.slice(7)), read(p, true));
  }
  const threeRoot = resolve(
    new URL('../../node_modules/three/', import.meta.url).pathname,
  );
  const visited = new Set();
  function three(p) {
    p = resolve(p);
    if (!p.startsWith(threeRoot + '/'))
      throw new Error('Dependency escaped Three.js');
    const name = 'three--' + flat(relative(threeRoot, p));
    if (visited.has(p)) return name;
    visited.add(p);
    let code = rewriteImports(
      readFileSync(p, 'utf8'),
      (spec) =>
        './' +
        three(
          spec === 'three'
            ? resolve(threeRoot, 'build/three.module.js')
            : spec.startsWith('three/addons/')
              ? resolve(threeRoot, 'examples/jsm', spec.slice(13))
              : resolve(dirname(p), spec),
        ),
    );
    // Three's SMAA lookup textures are files on the isolated origin, not data URLs.
    code = code.replace(
      /(['"])(data:image\/png;base64,([A-Za-z0-9+/=]+))\1/g,
      (_m, _quote, _url, data) => {
        const bytes = Buffer.from(data, 'base64');
        const asset = 'texture-' + hash(bytes).slice(0, 12) + '.png';
        put(asset, bytes);
        return `new URL('./${asset}', import.meta.url).href`;
      },
    );
    put(name, code);
    return name;
  }
  const runtimePaths = paths.filter(
    (p) =>
      (p.startsWith('client/') || p.startsWith('shared/')) &&
      /\.(js|css)$/.test(p) &&
      !/(?:demo|STYLE_REFERENCE|\.test\.)/.test(p) &&
      !exclude.includes(p),
  );
  for (const p of runtimePaths) {
    let code = read(p);
    const virtual = p.replace(/^client\//, '');
    if (p.endsWith('.js')) {
      code = patch(p, code);
      code = code
        .replaceAll('localStorage', 'globalThis.akeruCreator.storage')
        .replaceAll(
          'navigator.getGamepads',
          'globalThis.akeruCreator.noGamepads',
        )
        .replaceAll('style="', 'data-akeru-style="');
      code = rewriteImports(code, (spec) => {
        let name;
        if (spec === 'three')
          name = three(resolve(threeRoot, 'build/three.module.js'));
        else if (spec.startsWith('three/addons/'))
          name = three(resolve(threeRoot, 'examples/jsm', spec.slice(13)));
        else {
          const target = spec.startsWith('/')
            ? spec.slice(1)
            : posix.normalize(posix.join(posix.dirname(virtual), spec));
          if (target.startsWith('../')) throw new Error('Import escaped title');
          name = flat(target);
        }
        return './' + name;
      });
    } else
      code = code.replace(
        /url\(['"]?(\.?\/[^)'"\s]+)['"]?\)/g,
        (_m, spec) =>
          `url('./${flat(spec.startsWith('/') ? spec.slice(1) : posix.join(posix.dirname(virtual), spec))}')`,
      );
    if (p.endsWith('.css'))
      code = code.replace(
        /url\("data:image\/svg\+xml;utf8,([^"]+)"\)/g,
        (_m, svg) => {
          const bytes = decodeURIComponent(
            svg.replace(/%(?![0-9a-f]{2})/gi, '%25'),
          );
          const name = 'texture-' + hash(bytes).slice(0, 12) + '.svg';
          put(name, bytes);
          return `url('./${name}')`;
        },
      );
    put(flat(virtual), code);
  }
  for (const file of [
    'bridge.js',
    'bridge.css',
    'storage.js',
    'navigation.js',
    'controller-art.js',
  ])
    put(file, readFileSync(new URL(file, import.meta.url)));
  for (const file of readdirSync(new URL(`../${id}/src/`, import.meta.url)))
    put(file, readFileSync(new URL(`../${id}/src/${file}`, import.meta.url)));
  put(
    'save-client.js',
    readFileSync(new URL('../contracts/src/save-client.js', import.meta.url)),
  );
  put('THREE-LICENSE.txt', readFileSync(resolve(threeRoot, 'LICENSE')));
  put(
    'index.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><link rel="stylesheet" href="./styles--main.css"><link rel="stylesheet" href="./bridge.css"></head><body><canvas id="game-canvas"></canvas><div id="ui-root"></div><p id="akeru-status" role="status"></p><script type="module" src="./title.js"></script></body></html>`,
  );
  put(
    'build-record.json',
    JSON.stringify(
      {
        revision,
        sourceUrl,
        source: selected,
        approval:
          'Private creator evaluation only; redistribution and asset review pending',
        artifacts: readdirSync(out)
          .sort()
          .map((path) => ({
            path,
            sha256: hash(readFileSync(new URL(path, out))),
          })),
      },
      null,
      2,
    ),
  );
  console.log(`Built ${title} from pinned creator checkout`);
}
