/**
 * Build BUBBLEKICK from an explicitly supplied checkout of its repository, pinned to REVISION,
 * into ignored dist/bubblekick/. Nothing is deployed or activated.
 *
 *   BUBBLEKICK_SERVER=wss://<game-server>/ws node packages/bubblekick/build.mjs /path/to/bubblekick
 *
 * Without BUBBLEKICK_SERVER the build has no online endpoint (practice mode only).
 */
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
import { fileURLToPath } from 'node:url';
import { rewriteImports } from '../creator-preview/imports.mjs';

export const REVISION = process.env.BUBBLEKICK_REVISION || '';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const flat = (p) =>
  p === 'storage.js' ? 'game-storage.js' : p.replaceAll('/', '--');

export function serverEndpoint(value) {
  if (!value) return null;
  const u = new URL(value);
  if (
    u.protocol !== 'wss:' ||
    u.username ||
    u.password ||
    u.pathname !== '/ws' ||
    u.search ||
    u.hash
  )
    throw new Error('BUBBLEKICK_SERVER must be a wss://<host>/ws endpoint');
  return u.href;
}

export function buildBubblekick({
  source,
  revision = REVISION,
  server = null,
  out = resolve(root, 'dist/bubblekick'),
}) {
  if (!source) throw new Error('Pass the path to the BUBBLEKICK checkout');
  if (!/^[0-9a-f]{40}$/.test(revision))
    throw new Error('Set BUBBLEKICK_REVISION to the full commit to build');
  const endpoint = serverEndpoint(server);
  const git = (args) =>
    execFileSync('git', ['-C', resolve(source), ...args], {
      maxBuffer: 64 * 1024 * 1024,
    });
  if (git(['rev-parse', 'HEAD']).toString().trim() !== revision)
    throw new Error('Unexpected BUBBLEKICK revision');
  if (git(['status', '--porcelain', '--untracked-files=no']).length)
    throw new Error('BUBBLEKICK checkout has uncommitted changes');
  const remote = git(['remote', 'get-url', 'origin']).toString().trim();
  const sourceUrl = remote
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(sourceUrl))
    throw new Error('Unsupported BUBBLEKICK remote');
  const paths = git(['ls-tree', '-r', '--name-only', revision])
    .toString()
    .trim()
    .split('\n');

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const selected = [];
  const put = (name, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name))
      throw new Error(`Unsafe artifact name ${name}`);
    writeFileSync(resolve(out, name), bytes);
  };
  const read = (p) => {
    const b = git(['show', `${revision}:${p}`]);
    selected.push({ path: p, sha256: hash(b) });
    return b.toString();
  };

  // ---- Three.js: the root's pinned copy, flattened, only the modules actually reached ----
  const threeRoot = resolve(root, 'node_modules/three');
  const visited = new Set();
  function three(p) {
    p = resolve(p);
    if (!p.startsWith(threeRoot + '/'))
      throw new Error('Dependency escaped Three.js');
    const name = 'three--' + flat(relative(threeRoot, p));
    if (visited.has(p)) return name;
    visited.add(p);
    const code = rewriteImports(
      readFileSync(p, 'utf8'),
      (spec) =>
        './' +
        three(
          spec === 'three'
            ? resolve(threeRoot, 'build/three.module.min.js')
            : spec.startsWith('three/addons/')
              ? resolve(threeRoot, 'examples/jsm', spec.slice(13))
              : resolve(dirname(p), spec),
        ),
    );

    put(name, code);
    return name;
  }

  // ---- Game modules: client/ is served at the title root, shared/ under shared-- ----
  // The dev server maps / -> client/ and /shared -> shared/; relative imports follow the repo layout.
  function servedPath(from, spec) {
    const virtual = from.replace(/^client\//, '');
    const target = posix.normalize(posix.join(posix.dirname(virtual), spec));
    if (target.startsWith('../') || target.startsWith('/'))
      throw new Error('Import escaped title');
    return target;
  }
  const runtime = paths.filter(
    (p) =>
      (p.startsWith('client/') || p.startsWith('shared/')) &&
      /\.(js|css)$/.test(p) &&
      !/\.test\.js$/.test(p) &&
      p !== 'shared/sim/testkit.js' &&
      true,
  );
  for (const p of runtime) {
    let code = read(p);
    const virtual = p.replace(/^client\//, '');
    if (p.endsWith('.js')) {
      code = code
        .replaceAll('localStorage', 'globalThis.akeruCreator.storage')
        .replaceAll(
          'navigator.getGamepads',
          'globalThis.akeruCreator.noGamepads',
        );
      code = rewriteImports(code, (spec) => {
        if (spec === 'three')
          return './' + three(resolve(threeRoot, 'build/three.module.min.js'));
        if (spec.startsWith('three/addons/'))
          return (
            './' + three(resolve(threeRoot, 'examples/jsm', spec.slice(13)))
          );
        return './' + flat(servedPath(p, spec));
      });
    } else {
      const local = (spec) => flat(servedPath(p, spec));
      code = code
        .replace(
          /@import\s+(?:url\()?(['"])([^'"]+\.css)\1\)?/g,
          (_m, _q, spec) => `@import './${local(spec)}'`,
        )
        .replace(
          /url\(['"]?(\.?\.?\/[^)'"\s]+)['"]?\)/g,
          (_m, spec) => `url('./${local(spec)}')`,
        );
    }
    if (p === 'client/main.js')
      code = code.replace(
        'await adapter.initialize({',
        'await adapter.initialize({ storage: globalThis.bubblekickStorage,',
      );
    if (p === 'client/game/app.js') {
      const oldHeading = "this.screen.el.querySelector('h1').innerHTML";
      if (!code.includes(oldHeading))
        throw new Error('Bubblekick room heading patch no longer matches');
      code = code.replace(
        oldHeading,
        "this.screen.el.querySelector('.ribbon > span').innerHTML",
      );
    }
    if (p === 'client/game/app.js' && !endpoint)
      code = code.replace(
        '() => this.showOnline()',
        "() => this.showMain('Online play is not connected in this preview. Choose PLAY for local matches.')",
      );
    if (p === 'client/net/connection.js')
      code = code.replace(
        'export function defaultServerUrl() {',
        'export function defaultServerUrl() { if(globalThis.BUBBLEKICK_SERVER) return globalThis.BUBBLEKICK_SERVER;',
      );
    put(flat(virtual), code);
  }

  // ---- Adapter, shared bridge (unmodified) and generated config ----
  for (const file of [
    'bridge.js',
    'pill.js',
    'storage.js',
    'navigation.js',
    'controller-art.js',
  ])
    put(file, readFileSync(resolve(root, 'packages/creator-preview', file)));
  put(
    'save-client.js',
    readFileSync(resolve(root, 'packages/contracts/src/save-client.js')),
  );
  for (const file of readdirSync(resolve(here, 'src')))
    put(file, readFileSync(resolve(here, 'src', file)));
  put(
    'runtime-config.js',
    `export const serverUrl = ${JSON.stringify(endpoint)};\n`,
  );
  put('THREE-LICENSE.txt', readFileSync(resolve(threeRoot, 'LICENSE')));

  // ---- index.html: the game's own body, with the dev import map swapped for the adapter ----
  const page = read('client/index.html');
  const body = page
    .match(/<body>([\s\S]*?)<\/body>/)[1]
    .replace(/\s*<script\b[\s\S]*?<\/script>/g, '');
  const sheets = [
    ...page.matchAll(/<link rel="stylesheet" href="\/?([^"]+)"/g),
  ].map((m) => flat(m[1].replace(/^\.\//, '')));
  for (const s of sheets)
    if (!readdirSync(out).includes(s))
      throw new Error(`Missing stylesheet ${s}`);
  // Keep the game's generated modulepreload list (it saves ~12 round trips on mobile networks).
  const preloads = [
    ...page.matchAll(/<link rel="modulepreload" href="([^"]+)"/g),
  ].map(([, href]) =>
    href.startsWith('/vendor/three/')
      ? three(resolve(threeRoot, href.slice('/vendor/three/'.length)))
      : flat(servedPath('client/index.html', href)),
  );
  for (const m of preloads)
    if (!readdirSync(out).includes(m))
      throw new Error(`Missing preloaded module ${m}`);
  put(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">' +
      '<meta name="theme-color" content="#0b1220"><title>BUBBLEKICK</title>' +
      sheets.map((s) => `<link rel="stylesheet" href="./${s}">`).join('') +
      preloads.map((m) => `<link rel="modulepreload" href="./${m}">`).join('') +
      '<link rel="stylesheet" href="./akeru.css"></head><body>' +
      body.trim() +
      '<p id="akeru-status" role="status"></p><script type="module" src="./title.js"></script></body></html>\n',
  );

  const artifacts = readdirSync(out)
    .sort()
    .map((path) => ({ path, sha256: hash(readFileSync(resolve(out, path))) }));
  const record = {
    revision,
    sourceUrl,
    server: endpoint,
    source: selected,
    artifacts,
  };
  put('build-record.json', JSON.stringify(record, null, 2) + '\n');
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = buildBubblekick({
    source: process.argv[2],
    server: process.env.BUBBLEKICK_SERVER,
  });
  console.log(
    `Built BUBBLEKICK ${record.revision.slice(0, 12)}: ${record.artifacts.length} files, server ${record.server ?? 'none (practice only)'}`,
  );
}
