import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContainedFileReader } from '../../scripts/read-contained-file.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const audit = JSON.parse(
  readFileSync(resolve(root, 'compliance/rights-audits/anarch.json')),
);
const source = process.env.ANARCH_SOURCE;
if (!source)
  throw new Error(
    'Set ANARCH_SOURCE to the upstream checkout at ' + audit.revision,
  );
const emcc = 'emcc';
const version = execFileSync(emcc, ['--version'], { encoding: 'utf8' });
if (!/^emcc .* 4\.0\.15\b/m.test(version))
  throw new Error('Emscripten 4.0.15 required');
if (
  execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim() !== audit.revision
)
  throw new Error('Wrong upstream revision');
const out = resolve(root, 'dist/anarch');
const includes = resolve(root, 'dist/anarch-source');
mkdirSync(out, { recursive: true });
mkdirSync(includes, { recursive: true });
const selected = [
  'LICENSE',
  'game.h',
  'settings.h',
  'images.h',
  'levels.h',
  'texts.h',
  'palette.h',
  'raycastlib.h',
  'constants.h',
  'sounds.h',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceReader = createContainedFileReader(source);
for (const path of selected) {
  const evidence = audit.evidence.find((e) => e.path === path);
  const bytes = sourceReader.read(path);
  if (
    !evidence ||
    evidence.declaration.license !== 'CC0-1.0' ||
    sha(bytes) !== evidence.sha256
  )
    throw new Error('Source evidence mismatch: ' + path);
  writeFileSync(resolve(includes, path), bytes);
}
execFileSync(
  emcc,
  [
    resolve(here, 'src/frontend.c'),
    '-I' + includes,
    '-O2',
    '--no-entry',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sENVIRONMENT=web',
    '-sFILESYSTEM=0',
    '-sALLOW_MEMORY_GROWTH=0',
    '-sINITIAL_MEMORY=16777216',
    '-sEXPORTED_FUNCTIONS=["_akeru_init","_akeru_tick","_akeru_pixels","_akeru_save","_akeru_dirty","_akeru_audio","_akeru_mouse","_akeru_release","_akeru_state"]',
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]',
    '-o',
    resolve(out, 'engine.js'),
  ],
  { stdio: 'inherit' },
);
for (const file of readdirSync(resolve(here, 'src')).filter(
  (f) => !f.endsWith('.c'),
))
  copyFileSync(resolve(here, 'src', file), resolve(out, file));
copyFileSync(
  resolve(root, 'packages/contracts/src/save-client.js'),
  resolve(out, 'save-client.js'),
);
writeFileSync(resolve(out, 'ANARCH-LICENSE.txt'), sourceReader.read('LICENSE'));
writeFileSync(
  resolve(out, 'build-record.json'),
  JSON.stringify(
    {
      upstream: audit.upstreamUrl,
      revision: audit.revision,
      edition: 'base',
      mods: [],
      toolchain: 'Emscripten 4.0.15',
      approval: 'pending; local evaluation only',
      source: selected.map((path) => ({
        path,
        sha256: audit.evidence.find((e) => e.path === path).sha256,
      })),
      artifacts: readdirSync(out)
        .filter((path) => path !== 'build-record.json')
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
console.log('Built local Anarch in ' + out);
