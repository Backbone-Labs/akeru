import { mapInput } from './input.js';
import { fileSizes } from './engine-config.js';
const p = new URLSearchParams(location.hash.slice(1)),
  shell = p.get('shell'),
  nonce = p.get('nonce');
let seq = 0,
  received = -1,
  connected = false,
  ready = false,
  restart = false;
let hostPaused = false;
const portrait = matchMedia('(orientation: portrait)');
let gameStatus = {},
  lastTouch,
  lastHost;
const state = { paused: false, muted: false, actions: {} };
function updateLayout() {
  state.paused = hostPaused || portrait.matches;
  if (state.paused) state.actions = {};
  document.querySelector('#rotate').hidden = !portrait.matches;
}
portrait.addEventListener('change', updateLayout);
updateLayout();
const send = (type, payload) =>
  parent.postMessage(
    { protocol: 'akeru.catalog.v1', nonce, sequence: seq++, type, payload },
    shell,
  );
const contexts = new Set();
const Audio = window.AudioContext;
if (Audio)
  window.AudioContext = class extends Audio {
    constructor(...args) {
      super(...args);
      contexts.add(this);
    }
  };
const audioState = () =>
  state.muted
    ? 'off'
    : [...contexts].some((c) => c.state === 'running')
      ? 'on'
      : 'blocked';
async function enableAudio() {
  await Promise.race([
    Promise.all(
      [...contexts].map((c) => (c.state === 'closed' ? undefined : c.resume())),
    ).catch(() => {}),
    new Promise((r) => setTimeout(r, 500)),
  ]);
}
window.akeruBrawler = Object.freeze({
  status: () => structuredClone(gameStatus),
  report: (json) => {
    gameStatus = JSON.parse(json);
    if (ready && lastTouch !== gameStatus.playing) {
      lastTouch = gameStatus.playing;
      send('touch-overlay', { visible: lastTouch });
    }
    const canRestart = !gameStatus.online || gameStatus.host;
    if (ready && lastHost !== canRestart) {
      lastHost = canRestart;
      send('actions', {
        supported: [
          'audio',
          'audio-status',
          ...(canRestart ? ['restart'] : []),
        ],
      });
    }
  },
  read: () => JSON.stringify(state),
  take_restart: () => {
    const value = restart;
    restart = false;
    return value;
  },
  ready: () => {
    ready = true;
    document.querySelector('#status').hidden = true;
    send('playable', { sdkVersion: '0.1.0' });
    send('actions', { supported: ['audio', 'audio-status', 'restart'] });
  },
});
async function boot() {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './game.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const engine = new window.Engine({
      executable: 'game',
      fileSizes,
      canvas: document.querySelector('canvas'),
      canvasResizePolicy: 2,
      focusCanvas: true,
      experimentalVK: true,
      persistentPaths: [],
      onProgress: (loaded, total) => {
        if (ready) return;
        const progress = total > 0 ? Math.min(1, loaded / total) : 0;
        document.querySelector('#status').textContent =
          progress >= 1
            ? 'Starting Brawler…'
            : `Loading Brawler… ${Math.floor(progress * 100)}%`;
        send('loading', { progress });
      },
      onExit: () => send('exit', {}),
      onPrint: () => {},
      onPrintError: console.warn,
    });
    await engine.startGame({ mainPack: 'game.pck' });
  } catch (error) {
    document.querySelector('#status').textContent =
      'Brawler could not open. Please try again.';
    send('error', { code: 'initialization' });
    console.error(error);
  }
}
addEventListener('message', (event) => {
  const m = event.data;
  if (
    event.source !== parent ||
    event.origin !== shell ||
    !m ||
    m.protocol !== 'akeru.catalog.v1' ||
    m.nonce !== nonce ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence <= received
  )
    return;
  received = m.sequence;
  if (m.type === 'connect' && !connected && m.payload?.sdkVersion === '0.1.0') {
    connected = true;
    void boot();
  } else if (m.type === 'input' && ready && !state.paused)
    state.actions = mapInput(m.payload);
  else if (m.type === 'pause') {
    state.actions = {};
    hostPaused = true;
    updateLayout();
  } else if (m.type === 'resume') {
    state.actions = {};
    hostPaused = false;
    updateLayout();
    void enableAudio();
  } else if (m.type === 'action' && ready) void action(m.payload);
});
async function action(p) {
  if (!Number.isSafeInteger(p?.id)) return;
  let ok = true,
    message;
  if (p.action === 'audio') {
    state.muted = audioState() === 'on';
    if (!state.muted) await enableAudio();
    message =
      audioState() === 'on'
        ? 'Sound on.'
        : audioState() === 'off'
          ? 'Sound off.'
          : 'Resume and tap the game to enable sound.';
  } else if (p.action === 'audio-status')
    message =
      audioState() === 'on'
        ? 'Sound on.'
        : audioState() === 'off'
          ? 'Sound off.'
          : 'Resume and tap the game to enable sound.';
  else if (p.action === 'restart' && (!gameStatus.online || gameStatus.host)) {
    restart = true;
    state.actions = {};
    message = 'Starting a new run.';
  } else {
    ok = false;
    message = 'This game does not support that action.';
  }
  send('action-result', {
    id: p.id,
    ok,
    message,
    ...(typeof p.action === 'string' && p.action.startsWith('audio')
      ? { state: { audioState: audioState() } }
      : { state: {} }),
  });
}
document.querySelector('canvas').addEventListener('pointerdown', () => {
  if (!state.muted) void enableAudio();
});
addEventListener('blur', () => {
  state.actions = {};
});
