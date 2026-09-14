/** Pinned local-only compilation. Third-party source, notices and WASM stay in dist. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { verifySource } from '../puzzle-preview/build.mjs';
import { titles } from './titles.mjs';
export { titles } from './titles.mjs';
const core =
  'combi divvy draw-poly drawing dsf findloop grid latin laydomino loopgen malloc matching midend misc penrose penrose-legacy ps random sort tdq tree234 version hat spectre emcc'.split(
    ' ',
  );
export function adaptPrelude(source) {
  const needle = "'arguments': [decodeURIComponent(location.hash)]";
  if (!source.includes(needle)) throw new Error('Upstream launch hook changed');
  // The host handshake fragment must never be parsed as a puzzle seed.
  return source.replace(needle, "'arguments': []");
}
export function adaptLibrary(source) {
  const write =
      'localStorage.setItem(location.pathname + " preferences", prefsdata)',
    read = 'localStorage.getItem(location.pathname + " preferences")';
  if (!source.includes(write) || !source.includes(read))
    throw new Error('Upstream preference hooks changed');
  const adapted = source.replace(write, 'void prefsdata').replace(read, 'null');
  if (/(?:localStorage|sessionStorage)\s*\.\s*\w+\s*\(/.test(adapted))
    throw new Error('Unexpected direct storage access');
  return adapted;
}
export function buildTatham() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const inventory = JSON.parse(
    readFileSync(resolve(root, 'compliance/source-inventories/tatham.json')),
  );
  const source = resolve(root, 'dist/external/tatham'),
    build = resolve(root, 'dist/tatham-build');
  const emcc =
    process.env.AKERU_EMCC || '/tmp/akeru-emsdk/upstream/emscripten/emcc';
  const version = execFileSync(emcc, ['--version'], { encoding: 'utf8' });
  if (!/\b4\.0\.15\b/.test(version))
    throw new Error('Emscripten 4.0.15 is required');
  mkdirSync(resolve(root, 'dist/external'), { recursive: true });
  mkdirSync(build, { recursive: true });
  if (!existsSync(source))
    execFileSync(
      'git',
      ['clone', '--no-checkout', inventory.upstreamUrl, source],
      { stdio: 'inherit' },
    );
  execFileSync(
    'git',
    ['-C', source, 'checkout', '--detach', inventory.revision],
    { stdio: 'inherit' },
  );
  // Verify every tracked file used by this build, including transitive C headers.
  const selected = inventory.files.filter(
    (f) =>
      f.kind === 'file' &&
      (f.path === 'LICENCE' ||
        /^[^/]+\.(c|h)$/.test(f.path) ||
        ['emccpre.js', 'emcclib.js'].includes(f.path) ||
        titles.some((t) => f.path === `html/${t.engine}.html`)),
  );
  for (const entry of selected)
    verifySource(readFileSync(resolve(source, entry.path)), entry);
  writeFileSync(
    resolve(build, 'pre.js'),
    adaptPrelude(readFileSync(resolve(source, 'emccpre.js'), 'utf8')),
  );
  writeFileSync(
    resolve(build, 'lib.js'),
    adaptLibrary(readFileSync(resolve(source, 'emcclib.js'), 'utf8')),
  );
  for (const name of core)
    execFileSync(
      emcc,
      [
        '-O2',
        '-I',
        source,
        '-c',
        resolve(source, `${name}.c`),
        '-o',
        resolve(build, `${name}.o`),
      ],
      { stdio: 'inherit' },
    );
  const exports =
    '_mouseup _mousedown _mousemove _key _timer_callback _command _get_text_format _free_text_format _get_save_file _free_save_file _load_game _dlg_return_sval _dlg_return_ival _resize_puzzle _restore_puzzle_size _rescale_puzzle _prefs_load_callback _malloc _free _main'.split(
      ' ',
    );
  for (const title of titles) {
    const out = resolve(root, `dist/${title.id}`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    execFileSync(
      emcc,
      [
        '-O2',
        '-I',
        source,
        resolve(source, `${title.engine}.c`),
        ...core.map((n) => resolve(build, `${n}.o`)),
        '--pre-js',
        resolve(build, 'pre.js'),
        '--js-library',
        resolve(build, 'lib.js'),
        '--post-js',
        resolve(root, 'packages/tatham/src/bridge.js'),
        '-sALLOW_MEMORY_GROWTH=1',
        '-sENVIRONMENT=web',
        `-sEXPORTED_FUNCTIONS=${JSON.stringify(exports)}`,
        '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
        '-sWASM_BIGINT',
        '-o',
        resolve(out, 'engine.js'),
      ],
      { stdio: 'inherit' },
    );
    const instructions = readFileSync(
      resolve(source, `html/${title.engine}.html`),
      'utf8',
    )
      .split('\n')
      .slice(1)
      .join('\n')
      .replace(/<a\b[^>]*>/g, '')
      .replaceAll('</a>', '');
    const page = readFileSync(
      resolve(root, 'packages/tatham/src/index.html'),
      'utf8',
    )
      .replaceAll('{{TITLE}}', title.title)
      .replace('{{DESCRIPTION}}', title.description)
      .replace('{{INSTRUCTIONS}}', instructions)
      .replace('{{CONFIG}}', JSON.stringify(title));
    writeFileSync(resolve(out, 'index.html'), page);
    for (const f of ['title.js', 'style.css', 'save.js'])
      copyFileSync(resolve(root, 'packages/tatham/src', f), resolve(out, f));
    copyFileSync(
      resolve(root, 'packages/contracts/src/save-client.js'),
      resolve(out, 'save-client.js'),
    );
    copyFileSync(
      resolve(source, 'LICENCE'),
      resolve(out, 'UPSTREAM-LICENSE.txt'),
    );
    copyFileSync(
      resolve(dirname(emcc), 'LICENSE'),
      resolve(out, 'EMSCRIPTEN-LICENSE.txt'),
    );
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
    writeFileSync(
      resolve(out, 'build-record.json'),
      JSON.stringify(
        {
          upstream: inventory.upstreamUrl,
          revision: inventory.revision,
          engine: title.engine,
          compiler: version.split('\n')[0],
          approval: 'pending; local evaluation only',
          adaptation:
            'Original C engine and canvas frontend; host-only saves, no direct browser preferences, host handshake fragment removed; Akeru input/lifecycle and responsive shell.',
          source: selected.map((f) => ({
            path: f.path,
            sha256: sha(readFileSync(resolve(source, f.path))),
          })),
          artifacts: readdirSync(out)
            .filter((f) => f !== 'build-record.json')
            .sort()
            .map((path) => ({
              path,
              sha256: sha(readFileSync(resolve(out, path))),
            })),
        },
        null,
        2,
      ),
    );
    console.log(`Built ${title.title} → ${out}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildTatham();
