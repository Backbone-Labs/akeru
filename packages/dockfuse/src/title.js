// Akeru adapter for DOCKFUSE. Runs inside the isolated title frame and owns the authenticated
// host channel (via the shared creator bridge). The game is unmodified: it reads the host
// controller through a synthetic standard-mapping gamepad, keeps settings in the host save slot,
// and is paused/resumed through its own embedding API (window.__dockfuse).
import { connectCreator } from './bridge.js';
import { serverUrl } from './runtime-config.js';

// The game prefers ?server=, then this global, then its own origin.
if (serverUrl) globalThis.DOCKFUSE_SERVER = serverUrl;

const SETTINGS_KEY = 'dockfuse.settings';
const NAME_KEY = 'dockfuse.name';
const AUDIO_KEY = 'dockfuse.akeru.audio';
const game = () => globalThis.__dockfuse;

// ---- host controller -> standard gamepad -----------------------------------------------------
const BUTTONS = [
  'confirm',
  'cancel',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'view',
  'menu',
  null,
  null,
  'up',
  'down',
  'left',
  'right',
  null,
];
const AXES = ['moveX', 'moveY', 'lookX', 'lookY'];
let padSeen = false;
let padTimestamp = 0;
const pad = {
  id: 'Akeru host controller (STANDARD GAMEPAD)',
  index: 0,
  connected: true,
  mapping: 'standard',
  get timestamp() {
    return padTimestamp;
  },
  buttons: BUTTONS.map(() => ({ pressed: false, touched: false, value: 0 })),
  axes: [0, 0, 0, 0],
  vibrationActuator: null,
};
function applyControls(controls) {
  const b = controls?.buttons || {};
  const a = controls?.axes || {};
  let active = false;
  BUTTONS.forEach((name, i) => {
    const v = name ? Math.max(0, Math.min(1, Number(b[name]) || 0)) : 0;
    const slot = pad.buttons[i];
    slot.value = v;
    slot.pressed = v > 0.5;
    slot.touched = v > 0;
    if (v > 0.25) active = true;
  });
  AXES.forEach((name, i) => {
    const v = Math.max(-1, Math.min(1, Number(a[name]) || 0));
    pad.axes[i] = v;
    if (Math.abs(v) > 0.25) active = true;
  });
  if (active) padSeen = true;
  padTimestamp = performance.now();
}

// ---- audio facade for the Akeru pill ---------------------------------------------------------
function settingsVolume() {
  try {
    const s = JSON.parse(
      globalThis.akeruCreator.storage.getItem(SETTINGS_KEY) || '{}',
    );
    return Number.isFinite(s.volume) ? s.volume : 0.7;
  } catch {
    return 0.7;
  }
}
let audioEnabled = true;
const sfx = {
  get enabled() {
    return audioEnabled;
  },
  setEnabled(enabled) {
    audioEnabled = Boolean(enabled);
    game()?.audio?.setVolume(audioEnabled ? settingsVolume() : 0);
  },
  get ctx() {
    return game()?.audio?.context ?? null;
  },
  _unlock() {
    game()?.audio?.resume?.();
  },
};

globalThis.dockfuseAkeru = {
  sfx,
  get mode() {
    return game()?.mode === 'online' ? 'online' : 'practice';
  },
  get ready() {
    return game()?.ready;
  },
};

const bridge = connectCreator({
  handle: 'dockfuseAkeru',
  keys: [SETTINGS_KEY, NAME_KEY, AUDIO_KEY],
  pill: true,
  ownsNavigation: true,
  idle: {},
  input: () => ({}),
  async whenReady() {
    for (let i = 0; i < 600 && !game(); i++)
      await new Promise((r) => setTimeout(r, 25));
    if (!game()) throw new Error('DOCKFUSE did not start');
    await game().ready;
  },
  setup() {
    audioEnabled = globalThis.akeruCreator.storage.getItem(AUDIO_KEY) !== '0';
    sfx.setEnabled(audioEnabled);
  },
  audioChanged(_game, enabled) {
    globalThis.akeruCreator.storage.setItem(AUDIO_KEY, enabled ? '1' : '0');
  },
  // Rounds are not restartable mid-way; the in-game pause menu leaves to the main menu instead.
  restart: () => false,
  playing: () => Boolean(game()?.isPlaying?.()),
  // DOCKFUSE draws its own shooter touch controls; keep the host overlay hidden.
  touchOverlay: () => false,
  routeInput(controls) {
    applyControls(controls);
    return true; // the game's own menus take the pad
  },
  clear() {
    applyControls(null);
  },
});

// Only the host pad is visible to the game (the build routes navigator.getGamepads here).
bridge.noGamepads = () => (padSeen ? [pad] : []);

// Mirror the host pause state (menu overlay, backgrounding) into the game.
let hostPaused = null;
function syncPause() {
  const g = game();
  if (g?.setHostPaused) {
    const paused = bridge.paused;
    if (paused !== hostPaused) {
      hostPaused = paused;
      g.setHostPaused(paused);
    }
  }
  requestAnimationFrame(syncPause);
}
requestAnimationFrame(syncPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game()?.setHostPaused) {
    hostPaused = true;
    game().setHostPaused(true);
  }
});
