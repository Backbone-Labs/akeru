/**
 * Build DOCKFUSE from an explicitly supplied checkout of its repository, pinned to REVISION,
 * into ignored dist/dockfuse/. Nothing is deployed or activated.
 *
 *   DOCKFUSE_REVISION=<full commit> DOCKFUSE_SERVER=wss://<game-server>/ws \
 *     node packages/dockfuse/build.mjs /path/to/dockfuse
 *
 * Unlike the plain-ESM creator titles, DOCKFUSE is a TypeScript/Vite project: the recipe runs the
 * checkout's own pinned toolchain (`npm ci`, `vite build`) and then rewrites the single output
 * module for the isolated title origin. Without DOCKFUSE_SERVER the build is practice-only.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REVISION = process.env.DOCKFUSE_REVISION || '';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const hash = (b) => createHash('sha256').update(b).digest('hex');

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
    throw new Error('DOCKFUSE_SERVER must be a wss://<host>/ws endpoint');
  return u.href;
}

/** Route browser storage and gamepads through the Akeru host facade. */
export function adaptModule(code) {
  if (/\bimport\s*\(/.test(code) || /^\s*import\s/m.test(code))
    throw new Error('DOCKFUSE bundle must be self-contained');
  if (/data:image\//.test(code))
    throw new Error('Inline image in bundle needs an asset file');
  return code
    .replaceAll('localStorage', 'globalThis.akeruCreator.storage')
    .replaceAll('navigator.getGamepads', 'globalThis.akeruCreator.noGamepads');
}

/** Split the game's built page into its inline stylesheet and script-free body. */
export function splitPage(page) {
  const style = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1].trim())
    .join('\n');
  const body = page.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  if (!style || !body) throw new Error('Unexpected DOCKFUSE index.html');
  return {
    style,
    body: body.replace(/\s*<script\b[\s\S]*?<\/script>/g, '').trim(),
  };
}

export function buildDockfuse({
  source,
  revision = REVISION,
  server = null,
  out = resolve(root, 'dist/dockfuse'),
}) {
  if (!source) throw new Error('Pass the path to the DOCKFUSE checkout');
  if (!/^[0-9a-f]{40}$/.test(revision))
    throw new Error('Set DOCKFUSE_REVISION to the full commit to build');
  const endpoint = serverEndpoint(server);
  source = resolve(source);
  const git = (args) =>
    execFileSync('git', ['-C', source, ...args], {
      maxBuffer: 64 * 1024 * 1024,
    });
  if (git(['rev-parse', 'HEAD']).toString().trim() !== revision)
    throw new Error('Unexpected DOCKFUSE revision');
  if (git(['status', '--porcelain', '--untracked-files=no']).length)
    throw new Error('DOCKFUSE checkout has uncommitted changes');
  const remote = git(['remote', 'get-url', 'origin']).toString().trim();
  const sourceUrl = remote
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(sourceUrl))
    throw new Error('Unsupported DOCKFUSE remote');
  const paths = git(['ls-tree', '-r', '--name-only', revision])
    .toString()
    .trim()
    .split('\n');
  // every committed input to the build is recorded
  const selected = paths
    .filter((p) =>
      /^(src\/|index\.html$|package(-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(
        p,
      ),
    )
    .map((p) => ({ path: p, sha256: hash(git(['show', `${revision}:${p}`])) }));

  // ---- the game's own pinned toolchain ----
  // npm's own CLI script through this Node binary: works identically on every platform, no shell
  const npmCli = resolve(
    dirname(process.execPath),
    'node_modules/npm/bin/npm-cli.js',
  );
  if (!existsSync(npmCli)) throw new Error('npm-cli.js not found next to node');
  const npm = (args, options = {}) =>
    execFileSync(process.execPath, [npmCli, ...args], {
      cwd: source,
      env: { ...process.env, CI: '1' },
      ...options,
    });
  const run = (args) => npm(args, { stdio: 'inherit' });
  run(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  run(['run', 'build']);
  const built = resolve(source, 'dist/client');
  for (const f of ['index.html', 'main.js'])
    if (!existsSync(resolve(built, f)))
      throw new Error(`DOCKFUSE build did not produce ${f}`);
  if (readdirSync(built).length !== 2)
    throw new Error('DOCKFUSE build produced unexpected files');

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const put = (name, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name))
      throw new Error(`Unsafe artifact name ${name}`);
    writeFileSync(resolve(out, name), bytes);
  };

  put('main.js', adaptModule(readFileSync(resolve(built, 'main.js'), 'utf8')));
  const { style, body } = splitPage(
    readFileSync(resolve(built, 'index.html'), 'utf8'),
  );
  put('styles.css', style + '\n');

  // ---- adapter, shared bridge (unmodified) and generated config ----
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
  put(
    'THREE-LICENSE.txt',
    readFileSync(resolve(source, 'node_modules/three/LICENSE')),
  );
  put(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">' +
      '<meta name="theme-color" content="#0b0e12"><title>DOCKFUSE</title>' +
      '<link rel="stylesheet" href="./styles.css"><link rel="modulepreload" href="./main.js">' +
      '<link rel="stylesheet" href="./akeru.css"></head><body>' +
      body +
      '<p id="akeru-status" role="status"></p><script type="module" src="./title.js"></script></body></html>\n',
  );

  const artifacts = readdirSync(out)
    .sort()
    .map((path) => ({ path, sha256: hash(readFileSync(resolve(out, path))) }));
  const record = {
    revision,
    sourceUrl,
    server: endpoint,
    toolchain: {
      node: process.version,
      npm: execFileSync(npm, ['--version'], {
        shell: process.platform === 'win32',
      })
        .toString()
        .trim(),
    },
    source: selected,
    artifacts,
  };
  put('build-record.json', JSON.stringify(record, null, 2) + '\n');
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = buildDockfuse({
    source: process.argv[2],
    server: process.env.DOCKFUSE_SERVER,
  });
  console.log(
    `Built DOCKFUSE ${record.revision.slice(0, 12)}: ${record.artifacts.length} files, server ${record.server ?? 'none (practice only)'}`,
  );
}
