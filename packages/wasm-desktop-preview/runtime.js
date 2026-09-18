import { connectGame } from './host.js';
import { validSave, restore, snapshot } from './saves.js';
const id = document.body.dataset.game,
  tux = id === 'supertux';
const root = tux ? '/home/web_user/.local/share/supertux2' : '/home/web_user';
const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
let started = false,
  prior = new Set(),
  previousSave = '';
const mapping = tux
  ? { left: 37, right: 39, up: 38, down: 40, confirm: 32, cancel: 17, menu: 27 }
  : {
      left: 37,
      right: 39,
      up: 38,
      down: 40,
      confirm: [13, 32],
      cancel: [8, 86],
      menu: 27,
    };
function key(code, down) {
  const e = new KeyboardEvent(down ? 'keydown' : 'keyup', {
    bubbles: true,
    cancelable: true,
    keyCode: code,
    which: code,
  });
  canvas.dispatchEvent(e);
}
const host = connectGame({
  keyboard: false,
  validate: validSave,
  async start(state) {
    if (!crossOriginIsolated)
      throw Error('Threaded games require cross-origin isolation');
    let ready, fail;
    const startup = new Promise((resolve, reject) => {
      ready = resolve;
      fail = reject;
    });
    window.Module = {
      canvas,
      locateFile: (p) => new URL(p, location.href).href,
      print: () => {},
      printErr: (m) => console.warn(m),
      onAbort: (m) => fail(Error(String(m))),
      noInitialRun: !tux,
      setStatus: (text) => {
        if (!started) status.textContent = text || 'Starting game…';
      },
      onRuntimeInitialized: async () => {
        if (tux) return;
        try {
          status.textContent = 'Loading original tracks, karts and music…';
          const [data, files] = await Promise.all([
            fetch('./game.data').then((r) => r.arrayBuffer()),
            fetch('./files.json').then((r) => r.json()),
          ]);
          const bytes = new Uint8Array(data);
          for (const f of files) {
            window.FS.mkdirTree(f.path.slice(0, f.path.lastIndexOf('/')));
            window.FS.writeFile(
              f.path,
              bytes.subarray(f.start, f.start + f.length),
            );
          }
          window.FS.mkdirTree(root);
          restore(window.FS, root, state);
          const configPath =
            root + '/.config/supertuxkart/config-0.10/config.xml';
          window.FS.mkdirTree(configPath.slice(0, configPath.lastIndexOf('/')));
          const config = window.FS.analyzePath(configPath).exists
            ? window.FS.readFile(configPath, { encoding: 'utf8' })
            : '<stkconfig version="8"></stkconfig>';
          const offline = config
            .replace(/<enable_internet\b[^>]*\/>/g, '')
            .replace(
              '</stkconfig>',
              '<enable_internet value="2" /></stkconfig>',
            );
          window.FS.writeFile(configPath, offline);
          window.callMain(['--no-console-log']);
          ready();
        } catch (e) {
          fail(e);
        }
      },
    };
    window.config = { ws_enabled: false };
    window.sync_idbfs = async () => {
      host.changed();
    };
    window.load_idbfs = async () => {};
    window.supertux2_ispersistent = () => true;
    window.supertux_loadFiles = () => restore(window.FS, root, state);
    window.supertux2_syncfs = () => host.changed();
    window.supertux_saveFiles = () => host.changed();
    window.supertux_setAutofit = () => {};
    window.supertux_xhr_download = () => {
      status.textContent = 'Add-on downloads are unavailable in this preview.';
    };
    window.supertux_onready = () => ready();
    const script = document.createElement('script');
    script.src = tux ? './supertux2.js' : './supertuxkart.js';
    script.onerror = () => fail(Error('Engine unavailable'));
    document.body.append(script);
    await startup;
    started = true;
    canvas.focus();
    status.textContent = tux
      ? 'Original SuperTux · Arrows move · Space jump · Ctrl action · Esc menu'
      : 'Original SuperTuxKart · Offline preview · Arrows drive · Enter select · Space fire · V rescue';
    requestAnimationFrame(poll);
  },
  pause(value) {
    if (!started) return;
    for (const code of prior) key(code, false);
    prior.clear();
    if (value) window.Browser?.mainLoop.pause();
    else window.Browser?.mainLoop.resume();
  },
  serialize: () => snapshot(window.FS, root),
  dirty() {
    if (!started) return false;
    const next = JSON.stringify(snapshot(window.FS, root));
    if (next === previousSave) return false;
    previousSave = next;
    return true;
  },
});
function poll() {
  const stage = document.querySelector('#stage');
  const scale = Math.min(
    stage.clientWidth / canvas.width,
    stage.clientHeight / canvas.height,
  );
  canvas.style.setProperty(
    'width',
    `${Math.floor(canvas.width * scale)}px`,
    'important',
  );
  canvas.style.setProperty(
    'height',
    `${Math.floor(canvas.height * scale)}px`,
    'important',
  );
  const next = new Set([...host.held()].flatMap((a) => mapping[a] || []));
  for (const code of prior) if (!next.has(code)) key(code, false);
  for (const code of next) if (!prior.has(code)) key(code, true);
  prior = next;
  requestAnimationFrame(poll);
}
canvas.addEventListener('click', () => {
  canvas.focus();
  void window.Module?.SDL2?.audioContext?.resume();
});
