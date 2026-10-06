// Akeru adapter for BOLTYARD. Runs inside the isolated title frame and owns the
// authenticated host channel (via the shared creator bridge). The game itself is
// unmodified: it reads the host controller through a synthetic standard-mapping
// gamepad, stores settings through the host save slot, and is paused/resumed
// through its own embedding API (window.__boltyard).
import { connectCreator } from './bridge.js';
import { serverUrl } from './runtime-config.js';

// The game prefers ?server=, then this global, then its own origin.
if (serverUrl) globalThis.BOLTYARD_SERVER = serverUrl;

const SETTINGS_KEY = 'boltyard.settings.v1';
const AUDIO_KEY = 'boltyard.akeru.audio';
const game = () => globalThis.__boltyard;

// ---- host controller -> standard gamepad ----------------------------------------------------
// Standard mapping indices: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start,
// 10 L3, 11 R3, 12-15 D-pad up/down/left/right, 16 Home. Axes: LX, LY, RX, RY (+Y = down).
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

// The bridge reads this object for pill state and audio suspension.
globalThis.boltyardAkeru = {
  sfx,
  get mode() {
    return game()?.conn?.stats?.mode === 'online' ? 'online' : 'practice';
  },
  get ready() {
    return game()?.ready;
  },
};

const bridge = connectCreator({
  handle: 'boltyardAkeru',
  keys: [SETTINGS_KEY, AUDIO_KEY],
  pill: true,
  ownsNavigation: true,
  idle: {},
  input: () => ({}),
  async whenReady() {
    // main.js publishes window.__boltyard synchronously and resolves `ready` once the menu shows.
    for (let i = 0; i < 600 && !game(); i++)
      await new Promise((r) => setTimeout(r, 25));
    if (!game()) throw new Error('BOLTYARD did not start');
    await game().ready;
  },
  setup() {
    audioEnabled = globalThis.akeruCreator.storage.getItem(AUDIO_KEY) !== '0';
    sfx.setEnabled(audioEnabled);
  },
  audioChanged(_game, enabled) {
    globalThis.akeruCreator.storage.setItem(AUDIO_KEY, enabled ? '1' : '0');
  },
  // There is no mid-round restart; the in-game pause menu leaves to the main menu instead.
  restart: () => false,
  playing: () => Boolean(game()?.isPlaying?.()),
  // BOLTYARD draws its own shooter touch controls; keep the host overlay hidden.
  touchOverlay: () => false,
  routeInput(controls) {
    applyControls(controls);
    return true; // the game's own UI handles menu navigation from the pad
  },
  clear() {
    applyControls(null);
  },
});

// Only the host pad is visible to the game (the build routes navigator.getGamepads here),
// and only after the host has reported controller activity.
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
