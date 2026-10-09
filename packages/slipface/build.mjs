/** Build an explicitly supplied, pinned Slipface checkout into ignored artifacts. */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteImports } from '../creator-preview/imports.mjs';

export const id = 'slipface';
export const title = 'Slipface';
export const revision = 'b5d95427df70196ecf6a2ebed469020e12bbdf06';
/** The one module the adapter starts the game from. Only what it reaches is packaged. */
export const entry = 'src/game.js';

// The game is given the host's controller and the host's save slot. These are
// the standalone modules that would read a controller or open a database
// themselves, and the calls that would let any other module do it. A source
// that reaches either is not packaged.
const deviceModules = [
  'src/main.js',
  'src/standalone.js',
  'src/input/gamepad.js',
  'src/persist/idb.js',
];
const deviceApi =
  /\bgetGamepads\b|\bindexedDB\b|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\.cookie\b|\bimportScripts\b|\beval\s*\(|\bnew Function\b/;

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const flat = (path) => path.replaceAll('/', '--');
const adapterDir = new URL('./src/', import.meta.url);

/**
 * @param {{source: string, out?: URL, pin?: string}} options
 *   source  path to the authorized Slipface checkout
 *   out     where to write (tests only; the command always writes dist/slipface/)
 *   pin     revision to require (tests only; the command always uses `revision`)
 */
export function build({
  source,
  out = new URL(`../../dist/${id}/`, import.meta.url),
  pin = revision,
}) {
  if (!source) throw new Error('Pass the path to the Slipface checkout');
  const git = (args) =>
    execFileSync('git', ['-C', resolve(source), ...args], {
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (git(['rev-parse', 'HEAD']).toString().trim() !== pin)
    throw new Error('Unexpected Slipface source revision');
  if (git(['status', '--porcelain', '--untracked-files=no']).length)
    throw new Error('Slipface checkout has uncommitted changes');
  let remote;
  try {
    remote = git(['remote', 'get-url', 'origin']).toString().trim();
  } catch {
    throw new Error('Slipface checkout has no origin remote');
  }
  const sourceUrl = remote
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(sourceUrl))
    throw new Error('Unsupported Slipface remote');
  const tracked = new Set(
    git(['ls-tree', '-r', '--name-only', pin]).toString().trim().split('\n'),
  );

  const files = new Map();
  const put = (name, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name))
      throw new Error('Unsafe artifact name');
    if (files.has(name)) throw new Error('Duplicate artifact name: ' + name);
    files.set(name, bytes);
  };

  // The game: the entry module and everything it imports, read from the
  // commit (never the working tree) and flattened for the title origin.
  const selected = [];
  const queue = [entry];
  const seen = new Set(queue);
  while (queue.length) {
    const path = queue.shift();
    if (!tracked.has(path)) throw new Error('Missing Slipface module: ' + path);
    if (deviceModules.includes(path))
      throw new Error('Slipface source reaches a device module: ' + path);
    const bytes = git(['show', `${pin}:${path}`]);
    const code = bytes.toString();
    if (deviceApi.test(code))
      throw new Error('Slipface source reaches a device API: ' + path);
    selected.push({ path, sha256: hash(bytes) });
    put(
      flat(path.slice(4)),
      rewriteImports(code, (spec) => {
        if (!spec.startsWith('./') && !spec.startsWith('../'))
          throw new Error('Unsupported Slipface import: ' + spec);
        const target = posix.normalize(posix.join(posix.dirname(path), spec));
        if (!target.startsWith('src/'))
          throw new Error('Import escaped title: ' + spec);
        if (!target.endsWith('.js'))
          throw new Error('Unsupported Slipface import: ' + spec);
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
        return './' + flat(target.slice(4));
      }),
    );
  }

  // The adapter: reviewed here, and able to import only what was packaged.
  put(
    'save-client.js',
    readFileSync(new URL('../contracts/src/save-client.js', import.meta.url)),
  );
  const adapter = readdirSync(adapterDir).sort();
  for (const file of adapter)
    put(file, readFileSync(new URL(file, adapterDir)));
  for (const file of adapter.filter((name) => name.endsWith('.js')))
    rewriteImports(files.get(file).toString(), (spec) => {
      if (!spec.startsWith('./') || !files.has(spec.slice(2)))
        throw new Error(`Adapter import is not packaged: ${file} -> ${spec}`);
      return spec;
    });

  // Name every module up front, so the browser fetches them together rather
  // than discovering the import graph one level at a time.
  const preload = [...files.keys()]
    .filter((name) => name.endsWith('.js') && name !== 'title.js')
    .sort()
    .map((name) => `<link rel="modulepreload" href="./${name}">`)
    .join('');
  put(
    'index.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><link rel="stylesheet" href="./title.css">${preload}</head><body><div id="slipface"></div><p id="akeru-status" role="status"></p><script type="module" src="./title.js"></script></body></html>`,
  );

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(new URL(name, out), bytes);
  const record = {
    revision: pin,
    sourceUrl,
    source: selected.sort((a, b) => (a.path < b.path ? -1 : 1)),
    approval:
      'Evaluation build only; source licence, rights review and publication are pending',
    artifacts: [...files.keys()].sort().map((path) => ({
      path,
      sha256: hash(files.get(path)),
    })),
  };
  writeFileSync(
    new URL('build-record.json', out),
    JSON.stringify(record, null, 2),
  );
  return record;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  build({ source: process.argv[2] });
  console.log(`Built ${title} from pinned checkout`);
}
