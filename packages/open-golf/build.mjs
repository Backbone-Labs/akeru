/** Pinned upstream, private local build. This is not publication approval. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContainedFileReader } from '../../scripts/read-contained-file.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const inventory = JSON.parse(
  readFileSync(resolve(root, 'compliance/source-inventories/open-golf.json')),
);
const audit = JSON.parse(
  readFileSync(resolve(root, 'compliance/rights-audits/open-golf.json')),
);
const source = process.env.OPEN_GOLF_SOURCE;
if (!source)
  throw new Error(
    'Set OPEN_GOLF_SOURCE to pinned checkout ' + inventory.revision,
  );
if (
  execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim() !== inventory.revision
)
  throw new Error('Wrong upstream revision');
if (
  !/^emcc .* 4\.0\.15\b/m.test(
    execFileSync('emcc', ['--version'], { encoding: 'utf8' }),
  )
)
  throw new Error('Emscripten 4.0.15 required');
const stage = resolve(root, 'dist/open-golf-source');
const out = resolve(root, 'dist/open-golf');
// No stale scratch source or unlisted output may enter a new verified build.
rmSync(stage, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const reader = createContainedFileReader(source);
const selected = inventory.files.filter(
  (f) =>
    f.kind === 'file' &&
    (f.path.startsWith('src/') ||
      f.path.startsWith('data/') ||
      f.path === 'LICENSE' ||
      f.path === 'README.md'),
);
for (const f of selected) {
  const bytes = reader.read(f.path);
  const blob = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  if (blob !== f.gitObjectId)
    throw new Error('Source inventory mismatch: ' + f.path);
  mkdirSync(dirname(resolve(stage, f.path)), { recursive: true });
  writeFileSync(resolve(stage, f.path), bytes);
}
function patch(path, from, to) {
  const file = resolve(stage, path),
    text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (!text.includes(from)) throw new Error('Patch anchor missing: ' + path);
  writeFileSync(file, text.replace(from, to));
}
// Serialize loader work on the browser thread: no SAB, workers or service worker.
patch(
  'src/common/data.c',
  '    golf_thread_create(_golf_data_thread_fn, NULL, "_golf_data_thread_fn");',
  '    /* Akeru: synchronous dependency loading on the GL thread. */',
);
patch(
  'src/common/data.c',
  '        golf_mutex_lock(&_file_events_lock);\n        vec_push(&_file_events, _file_event(FILE_LOADED, file));\n        golf_mutex_unlock(&_file_events_lock);',
  '        if (loader->finalize_fn) loader->finalize_fn(golf_data.ptr);\n        map_get(&_loaded_data, file.path)->is_loaded = true;',
);
patch(
  'src/common/data.c',
  '    golf_mutex_lock(&_files_to_load_lock);\n    vec_push(&_files_to_load, golf_file(path));\n    golf_mutex_unlock(&_files_to_load_lock);',
  '    _golf_data_thread_load_file(golf_file(path));',
);
patch(
  'src/common/inputs.c',
  '    if (event->type == SAPP_EVENTTYPE_TOUCHES_BEGAN) {',
  '    if (event->type == SAPP_EVENTTYPE_MOUSE_DOWN) inputs.is_touch = false;\n    if (event->type == SAPP_EVENTTYPE_TOUCHES_BEGAN) {\n        inputs.is_touch = true;',
);
// Replace browser-owned IDBFS with in-memory FS. Only the host persists bytes.
patch(
  'src/common/storage.c',
  "            FS.mkdir('/opengolf_persistent_data');\n            FS.mount(IDBFS, {}, '/opengolf_persistent_data');\n            Module.syncdone = 0;\n            FS.syncfs(true, function(err) {\n                assert(!err);\n                Module.syncdone = 1;\n                });",
  '            Module.syncdone = 1;',
);
patch(
  'src/common/storage.c',
  '    if (emscripten_run_script_int("Module.syncdone") == 0) {',
  '    if (0) {',
);
patch(
  'src/common/storage.c',
  '            FS.syncfs(function (err) {\n                assert(!err);\n                console.log("SAVED");\n                });',
  '            Module.akeruSaveDirty = (Module.akeruSaveDirty || 0) + 1;',
);
patch(
  'src/golf/main.c',
  'static void frame(void) {',
  'static bool akeru_paused = false;\nstatic bool akeru_ready = false;\nstatic void frame(void) {\n    if (akeru_paused) return;',
);
patch(
  'src/golf/main.c',
  '    golf_update(dt);',
  '    if (dt > 0.05f) dt = 0.05f;\n    golf_update(dt);\n    akeru_ready = golf_get()->state != GOLF_STATE_TITLE_SCREEN;',
);
patch(
  'src/golf/main.c',
  'static void event(const sapp_event *event) {',
  'static void event(const sapp_event *event) {\n    if (akeru_paused) return;',
);
patch(
  'src/golf/main.c',
  '            .enable_clipboard = true,',
  '            .enable_clipboard = false,',
);
writeFileSync(
  resolve(stage, 'src/golf/main.c'),
  readFileSync(resolve(stage, 'src/golf/main.c'), 'utf8') +
    '\n' +
    readFileSync(resolve(here, 'src/bridge.c'), 'utf8'),
);
// Build embedded ZIP ourselves; never execute upstream helper binaries.
execFileSync('python3', [
  '-c',
  `import zipfile, pathlib\ns=pathlib.Path(${JSON.stringify(stage)})\nwith zipfile.ZipFile(s/'data.zip','w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted((s/'data').rglob('*')):\n  if p.is_file():\n   i=zipfile.ZipInfo(str(p.relative_to(s/'data')), (2020,1,1,0,0,0)); i.compress_type=zipfile.ZIP_DEFLATED; z.writestr(i,p.read_bytes())\nb=(s/'data.zip').read_bytes()\n(s/'src/common/data_zip.h').write_text('static const unsigned char golf_data_zip[] = {'+','.join(str(v) for v in b)+'};')`,
]);
const sources = ['common', 'golf'].flatMap((d) =>
  readdirSync(resolve(stage, 'src', d))
    .filter((f) => f.endsWith('.c'))
    .map((f) => `src/${d}/${f}`),
);
for (const [d, files] of Object.entries({
  sokol: ['impl.c'],
  stb: ['impl.c'],
  mattiasgustavsson_libs: ['impl.c'],
  fast_obj: ['fast_obj.c'],
  parson: ['parson.c'],
  cimgui: [
    'cimgui.cpp',
    'imgui/imgui.cpp',
    'imgui/imgui_draw.cpp',
    'imgui/imgui_tables.cpp',
    'imgui/imgui_widgets.cpp',
    'imgui/imgui_demo.cpp',
  ],
  xatlas: ['xatlas.cpp'],
}))
  for (const f of files) sources.push(`src/3rd_party/${d}/${f}`);
const objects = [];
for (const [i, path] of sources.entries()) {
  const obj = resolve(stage, `object-${i}.o`);
  objects.push(obj);
  execFileSync(
    path.endsWith('.cpp') ? 'em++' : 'emcc',
    [
      resolve(stage, path),
      '-c',
      '-O2',
      '-DNDEBUG',
      '-DSOKOL_GLES3',
      '-DGOLF_PLATFORM_EMSCRIPTEN',
      '-Wno-incompatible-function-pointer-types',
      '-I' + resolve(stage, 'src'),
      '-I' + resolve(stage, 'src/3rd_party'),
      '-o',
      obj,
    ],
    { stdio: 'inherit' },
  );
}
execFileSync(
  'em++',
  [
    ...objects,
    '-O2',
    '-sUSE_WEBGL2=1',
    '-sFULL_ES3=1',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sSTACK_SIZE=5242880',
    '-sINITIAL_MEMORY=67108864',
    '-sMAXIMUM_MEMORY=268435456',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sENVIRONMENT=web',
    '-sEXPORTED_RUNTIME_METHODS=["FS"]',
    '-o',
    resolve(out, 'engine.js'),
  ],
  { stdio: 'inherit' },
);
for (const f of readdirSync(resolve(here, 'src')).filter(
  (f) => !f.endsWith('.c'),
))
  copyFileSync(resolve(here, 'src', f), resolve(out, f));
copyFileSync(
  resolve(root, 'packages/contracts/src/save-client.js'),
  resolve(out, 'save-client.js'),
);
writeFileSync(
  resolve(out, 'UPSTREAM-NOTICES.txt'),
  audit.evidence
    .map((e) => `\n===== ${e.path} =====\n${reader.read(e.path).toString()}`)
    .join('\n'),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
writeFileSync(
  resolve(out, 'build-record.json'),
  JSON.stringify(
    {
      upstream: inventory.upstreamUrl,
      revision: inventory.revision,
      toolchain: 'Emscripten 4.0.15',
      approval: 'pending; local evaluation only',
      rightsStatus: 'unknown',
      modifications: [
        'Single browser thread asset loader',
        'Host-owned save bridge replaces IDBFS',
        'Controller/keyboard lifecycle bridge',
      ],
      source: selected.map((f) => ({
        path: f.path,
        gitObjectId: f.gitObjectId,
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
  ) + '\n',
);
console.log('Built local Open Golf: ' + out);
