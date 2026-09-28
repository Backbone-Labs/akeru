/** Explicit local build from inventoried upstream sources. Not publication approval. */
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { beginBuild, replaceRequired, root } from '../arcade-preview/build.mjs';
const b = beginBuild('operation-blackline');
const threeRoot = resolve(root, 'node_modules/three-blackline');
const visited = new Set();
function three(path) {
  path = resolve(path);
  if (!path.startsWith(threeRoot + '/'))
    throw Error('Dependency escaped Three.js');
  const name = 'three--' + relative(threeRoot, path).replaceAll('/', '--');
  if (visited.has(path)) return name;
  visited.add(path);
  const content = readFileSync(path, 'utf8').replace(
    /(from\s*|import\s*)['"]([^'"]+)['"]/g,
    (_match, prefix, spec) =>
      `${prefix}'./${three(spec === 'three' ? resolve(threeRoot, 'build/three.module.js') : resolve(dirname(path), spec))}'`,
  );
  b.put(name, content);
  return name;
}
for (const entry of b.inventory.files.filter((f) =>
  /^public\/js\/.*\.js$/.test(f.path),
)) {
  const name = entry.path.split('/').at(-1);
  let code = b.read(entry.path).toString();
  code = code.replaceAll('localStorage.', 'globalThis.akeruBlackline.storage.');
  code = code.replaceAll('style="', 'data-akeru-style="');
  if (name === 'main.js') {
    code = replaceRequired(
      code,
      "fetch('/shared/map-spec.json')",
      "fetch('./map-spec.json')",
    );
    code = code.replaceAll("import('/js/", "import('./engine--");
    const a = code.indexOf('    /* autotest hooks'),
      end = code.indexOf("    setStatus('Ready.');", a);
    if (a < 0 || end < 0) throw Error('Blackline boot anchor changed');
    code = code.slice(0, a) + code.slice(end);
    code = code.replace(
      "    if (q.get('autotest') !== '1') window.__shotReady = true;",
      '',
    );
    code = replaceRequired(
      code,
      "    setStatus('BOOT ERROR: ' + err.message);",
      "    setStatus('BOOT ERROR: ' + err.message);\n    throw err;",
    );
    code =
      code.slice(0, code.indexOf('/* PWA service worker')) +
      '\nawait boot();\n';
    code = replaceRequired(
      code,
      '      let dt = (now - last) / 1000; last = now;',
      '      let dt = (now - last) / 1000; last = now;\n      if (document.hidden) return;',
    );
  }
  if (name === 'net.js') {
    const a = code.indexOf('  _connect() {'),
      end = code.indexOf('  _onSnap(snap) {', a);
    if (a < 0 || end < 0) throw Error('Blackline network anchor changed');
    code =
      code.slice(0, a) +
      `  // Akeru owns sockets, room membership and session credentials.
  _connect() {},
  _disconnect() { globalThis.akeruBlackline.leave?.(); this.snaps.length = 0; Game.state.players.clear(); },
  send() {},
  shoot() {},
  _sendInput() {},
` +
      code.slice(end);
    code = code.replace(
      'const src = (rowB || ra);',
      'const src = (rowB || rowA);',
    );
  }
  if (name === 'engine.js') {
    // The upstream renderer ran before player/camera/model updates, displaying
    // the previous frame. Present only after this frame's simulation and camera.
    code = replaceRequired(code, '    }, -1000);', '    }, 1000);');
  }
  if (name === 'player.js') {
    code = replaceRequired(
      code,
      '  update(dt) {',
      '  update(dt) {\n    if (Game.akeruPredictionUpdate) return Game.akeruPredictionUpdate(dt);',
    );
    code = code.replaceAll(
      "Game.bus.emit('footstep',",
      "if (!Game.akeruReplaying) Game.bus.emit('footstep',",
    );
    code = code.replaceAll(
      "Game.bus.emit('wpn:ads',",
      "if (!Game.akeruReplaying) Game.bus.emit('wpn:ads',",
    );
    code = replaceRequired(
      code,
      '    if (!locked) {',
      '    if (!locked && Game.akeruInputActive) return;\n    if (!locked) {',
    );
    code = replaceRequired(
      code,
      '  _onKeyDown(e) {',
      "  _onKeyDown(e) {\n    if (e.target?.matches('input,textarea,select')) return;",
    );
    code = replaceRequired(
      code,
      "    if (Game.state.phase !== 'playing') {",
      "    if (Game.state.phase !== 'playing' || !globalThis.akeruBlackline.active()) {",
    );
  }
  if (name === 'weapons.js') {
    code = code.replaceAll(
      'document.pointerLockElement || window.__OBL_AUTOTEST__',
      'document.pointerLockElement || Game.akeruInputActive',
    );
    code = replaceRequired(
      code,
      "const active = Game.state.phase === 'playing' &&",
      "const active = globalThis.akeruBlackline.active() && Game.state.phase === 'playing' &&",
    );
  }
  if (name === 'hud.js') {
    code = code.replaceAll(
      "if (ev.code === 'Tab')",
      "if (ev.code === 'Tab' && Game.state.phase === 'playing')",
    );
  }
  if (name === 'menus.js') {
    code = replaceRequired(
      code,
      '  lockCanvas() {',
      '  lockCanvas() {\n    if (Game.akeruInputActive) return;',
    );
    code = replaceRequired(
      code,
      '  showHint() {',
      '  showHint() {\n    if (Game.akeruInputActive) return;',
    );
    code = replaceRequired(
      code,
      '    const locked = !!document.pointerLockElement;',
      '    const locked = !!document.pointerLockElement;\n    if (!locked && Game.akeruInputActive) return;',
    );
  }
  code = code.replace(
    /from 'three'/g,
    `from './${three(resolve(threeRoot, 'build/three.module.js'))}'`,
  );
  code = code.replace(
    /from '\/vendor\/three\/([^']+)'/g,
    (_m, path) => `from './${three(resolve(threeRoot, path))}'`,
  );
  b.put('engine--' + name, code);
}
let html = b.read('public/index.html').toString();
const inline = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!inline) throw Error('Blackline page style changed');
b.put('page.css', inline);
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(
    /<style>[\s\S]*?<\/style>/,
    '<link rel="stylesheet" href="page.css"><link rel="stylesheet" href="adapter.css"><link rel="stylesheet" href="controls.css">',
  )
  .replace(/<link rel="(?:manifest|apple-touch-icon|icon)"[^>]*>/g, '')
  .replaceAll('/css/', '')
  .replace('src="/js/main.js"', 'src="title.js"')
  .replace('<button id="btn-deploy"', '<button hidden id="btn-deploy"')
  .replace('<input id="input-name"', '<input hidden id="input-name"')
  .replace(
    'Host on your PC &mdash; squadmates join via your LAN URL.',
    'Guest play · Your squad joins through a private invite.',
  )
  .replace(
    '<div id="menu-note">',
    '<section id="akeru-room-panel" aria-label="Private multiplayer"></section><div id="menu-note">',
  )
  .replace(
    '</body>',
    '<p id="status" hidden></p><span id="save-status" hidden></span></body>',
  );
b.put('index.html', html);
for (const name of ['menu.css', 'hud.css'])
  b.put(name, b.read('public/css/' + name));
b.put('map-spec.json', b.read('shared/map-spec.json'));
b.put('UPSTREAM-LICENSE.txt', b.read('LICENSE'));
b.put('THREE-LICENSE.txt', readFileSync(resolve(threeRoot, 'LICENSE')));
b.finish();
