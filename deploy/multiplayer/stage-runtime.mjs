/** Copy the runtime dependency closure already installed by the root lockfile. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
const root = resolve(new URL('../..', import.meta.url).pathname);
if (
  process.argv.length > 3 ||
  (process.argv[2] && process.argv[2] !== '/runtime')
)
  throw Error(
    'Only the container destination /runtime is accepted; omit it for local staging',
  );
// Never turn a command-line path into a write destination.
const out =
  process.argv[2] === '/runtime'
    ? '/runtime'
    : resolve(root, 'dist/multiplayer-runtime');
const read = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const lock = read('package-lock.json');
const manifest = read('deploy/multiplayer/runtime-package.json');
const sourcePackage = read('package.json');
const visited = new Set();
function locate(from, name) {
  let at = from;
  for (;;) {
    const candidate = posix.join(at, 'node_modules', name);
    if (lock.packages[candidate]) return candidate;
    if (!at || at === '.') return null;
    at = posix.dirname(at);
    if (at === '.') at = '';
  }
}
function include(path) {
  if (visited.has(path)) return;
  const record = lock.packages[path];
  if (!record || record.link || !record.integrity)
    throw Error(`Runtime package must be integrity-locked: ${path}`);
  visited.add(path);
  const target = resolve(out, path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(root, path), target, {
    recursive: true,
    // Nested dependencies are selected separately using the lockfile.
    filter: (source) =>
      source === resolve(root, path) ||
      !source.includes('/node_modules/', resolve(root, path).length),
  });
  const required = { ...record.dependencies, ...record.peerDependencies };
  for (const name of Object.keys({
    ...required,
    ...record.optionalDependencies,
  })) {
    const dependency = locate(path, name);
    if (dependency && existsSync(resolve(root, dependency)))
      include(dependency);
    else if (
      record.optionalDependencies?.[name] ||
      record.peerDependenciesMeta?.[name]?.optional
    )
      continue;
    else throw Error(`Missing locked runtime dependency ${name} from ${path}`);
  }
}
mkdirSync(out, { recursive: true });
for (const [name, version] of Object.entries(manifest.dependencies)) {
  if (
    (sourcePackage.dependencies?.[name] ??
      sourcePackage.devDependencies?.[name]) !== version
  )
    throw Error(`Runtime version differs from root manifest: ${name}`);
  include(locate('', name));
}
writeFileSync(resolve(out, 'package.json'), JSON.stringify(manifest, null, 2));
writeFileSync(
  resolve(out, 'runtime-lock-evidence.json'),
  JSON.stringify(
    {
      lockfileVersion: lock.lockfileVersion,
      packages: Object.fromEntries(
        [...visited].sort().map((path) => [
          path,
          {
            version: lock.packages[path].version,
            integrity: lock.packages[path].integrity,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
for (const path of [
  'LICENSE',
  'packages/multiplayer/server.mjs',
  'packages/multiplayer/src/protocol.js',
  'dist/kart-server',
  'dist/blackline-server',
  'packages/operation-blackline/src/motion.js',
  'packages/old-san-juan-kart/src/network-state.js',
  ...['old-san-juan-kart', 'operation-blackline'].flatMap((id) =>
    ['room.mjs', 'simulation.mjs', 'protocol.js'].map(
      (file) => `packages/${id}/multiplayer/${file}`,
    ),
  ),
]) {
  mkdirSync(dirname(resolve(out, path)), { recursive: true });
  cpSync(resolve(root, path), resolve(out, path), { recursive: true });
}
console.log(`Staged ${visited.size} integrity-locked runtime packages`);
