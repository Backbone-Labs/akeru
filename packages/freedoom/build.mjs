/** Explicit local source build. No artifacts enter the public repository. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources, editions } from './sources.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });
if (
  !/^emcc .* 4\.0\.15\b/m.test(
    execFileSync('emcc', ['--version'], { encoding: 'utf8' }),
  )
)
  throw new Error('Emscripten 4.0.15 required');
const deutex = process.env.DEUTEX || 'deutex';
if (
  execFileSync(deutex, ['--version'], { encoding: 'utf8' }).trim() !==
  'DeuTex 5.2.3'
)
  throw new Error('DeuTex 5.2.3 required');
if (
  execFileSync('python3', ['-c', 'import PIL; print(PIL.__version__)'], {
    encoding: 'utf8',
  }).trim() !== '11.3.0'
)
  throw new Error('Pillow 11.3.0 required');
const work = resolve(root, 'dist/freedoom-source');
mkdirSync(work, { recursive: true });
for (const [kind, source] of Object.entries(sources)) {
  const checkout =
    process.env[kind === 'engine' ? 'PRBOOM_SOURCE' : 'FREEDOOM_SOURCE'];
  if (!checkout)
    throw new Error(
      'Set PRBOOM_SOURCE and FREEDOOM_SOURCE to the pinned original checkouts',
    );
  const archive = execFileSync(
    'git',
    ['-C', checkout, 'archive', source.revision],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  if (sha(archive) !== source.archiveSha256)
    throw new Error('Source archive mismatch: ' + kind);
  const directory = resolve(work, kind);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const path = resolve(work, kind + '.tar');
  writeFileSync(path, archive);
  run('tar', ['-xf', path, '-C', directory]);
}
const engine = resolve(work, 'engine'),
  data = resolve(work, 'data');
run(
  'make',
  [
    'platform=emscripten',
    'GIT_VERSION=' + sources.engine.revision,
    'HAVE_THREADS=0',
    'WANT_FLUIDSYNTH=0',
    'CC=emcc',
    'AR=emar',
    '-j4',
  ],
  engine,
);
run(
  'make',
  ['DEUTEX=' + deutex, 'VERSION=v0.14.0-alpha-d14dbbee', '-j4'],
  data,
);
copyFileSync(
  resolve(engine, 'prboom_libretro_emscripten.bc'),
  resolve(work, 'prboom.a'),
);
const exports = [
  'init',
  'tick',
  'mouse',
  'release',
  'pixels',
  'width',
  'height',
  'audio',
  'audio_count',
  'save',
  'serialize',
  'restore',
  'state',
  'tic',
  'level',
  'restart',
  'fps',
].map((name) => '_akeru_' + name);
run('emcc', [
  resolve(here, 'src/frontend.c'),
  resolve(work, 'prboom.a'),
  '-I' + resolve(engine, 'libretro/libretro-common/include'),
  '-O2',
  '--no-entry',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sENVIRONMENT=web',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sINITIAL_MEMORY=134217728',
  '-sEXPORTED_FUNCTIONS=' + JSON.stringify(exports),
  '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","FS"]',
  '-o',
  resolve(work, 'engine.js'),
]);
for (const [id, edition] of Object.entries(editions)) {
  const out = resolve(root, 'dist', id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const path of readdirSync(resolve(here, 'src')).filter(
    (p) => !p.endsWith('.c'),
  ))
    copyFileSync(resolve(here, 'src', path), resolve(out, path));
  writeFileSync(
    resolve(out, 'index.html'),
    readFileSync(resolve(out, 'index.html'), 'utf8').replace(
      '<title>Freedoom</title>',
      '<title>' + edition.title + '</title>',
    ),
  );
  for (const path of ['engine.js', 'engine.wasm'])
    copyFileSync(resolve(work, path), resolve(out, path));
  copyFileSync(resolve(data, 'wads', id + '.wad'), resolve(out, 'game.wad'));
  copyFileSync(
    resolve(root, 'packages/contracts/src/save-client.js'),
    resolve(out, 'save-client.js'),
  );
  copyFileSync(resolve(engine, 'COPYING'), resolve(out, 'PRBOOM-COPYING.txt'));
  for (const path of [
    'COPYING.adoc',
    'CREDITS',
    'CREDITS-LEVELS',
    'CREDITS-MUSIC',
  ])
    copyFileSync(
      resolve(data, path),
      resolve(out, 'FREEDOOM-' + path + '.txt'),
    );
  writeFileSync(
    resolve(out, 'build-record.json'),
    JSON.stringify(
      {
        upstream: sources.engine.url,
        revision: sources.engine.revision,
        sources,
        id,
        mode: edition.mode,
        toolchain: 'Emscripten 4.0.15; Pillow 11.3.0; DeuTex 5.2.3',
        approval: 'pending; local evaluation only',
        assetRights:
          'unknown; upstream BSD declaration and existing credits map retained, per-asset review pending',
        artifacts: readdirSync(out)
          .sort()
          .map((path) => ({
            path,
            sha256: sha(readFileSync(resolve(out, path))),
          })),
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(
  'Built Phase 1, Phase 2 and FreeDM solo practice in ignored dist directories.',
);
