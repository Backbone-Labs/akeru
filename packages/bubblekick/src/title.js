import { connectCreator } from './bridge.js';
import { serverUrl } from './runtime-config.js';
if (serverUrl) globalThis.BUBBLEKICK_SERVER = serverUrl;
const game = () => globalThis.__bubblekick?.game;
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

const SAVE_KEY = 'bubblekick.save.v1',
  AUDIO_KEY = 'bubblekick.audio.v1';
let enabled = true;
const sfx = {
  get enabled() {
    return enabled;
  },
  setEnabled(value) {
    enabled = Boolean(value);
    game()?.setMuted(!enabled);
  },
  get ctx() {
    return game()?.audio?.ctx ?? null;
  },
  _unlock() {
    game()?.audio?.unlock();
  },
};
globalThis.bubblekickAkeru = {
  sfx,
  get mode() {
    return game()?.session?.online ? 'online' : 'local';
  },
};
globalThis.bubblekickStorage = {
  async get(key) {
    if (key !== 'save') throw Error('Unknown save slot');
    const raw = globalThis.akeruCreator.storage.getItem(SAVE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (value?.settings && serverUrl) value.settings.server = serverUrl;
    return value;
  },
  async set(key, value) {
    if (key !== 'save') throw Error('Unknown save slot');
    globalThis.akeruCreator.storage.setItem(SAVE_KEY, JSON.stringify(value));
    return true;
  },
};
const bridge = connectCreator({
  handle: 'bubblekickAkeru',
  keys: [SAVE_KEY, AUDIO_KEY],
  pill: true,
  ownsNavigation: true,
  idle: {},
  input: () => ({}),
  async whenReady() {
    for (let i = 0; i < 600 && !game()?.running; i++)
      await new Promise((r) => setTimeout(r, 25));
    if (!game()?.running) throw Error('Bubble Kick did not start');
  },
  setup() {
    enabled = bridge.storage.getItem(AUDIO_KEY) !== '0';
    sfx.setEnabled(enabled);
  },
  audioChanged(_g, value) {
    bridge.storage.setItem(AUDIO_KEY, value ? '1' : '0');
  },
  beforeSave() {
    if (game()?.save?.data)
      bridge.storage.setItem(SAVE_KEY, JSON.stringify(game().save.data));
  },
  restart() {
    if (!game()?.lastStart || game()?.session?.online) return false;
    game().restart();
    return true;
  },
  lifecycle(value) {
    value ? game()?.pause('host') : game()?.resume();
  },
  playing: () => game()?.screen?.name === 'match',
  routeInput(controls) {
    applyControls(controls);
    return true;
  },
  clear() {
    applyControls(null);
    game()?.input?.clearAll();
  },
});
bridge.noGamepads = () => (padSeen ? [pad] : []);
let paused = null;
function sync() {
  const g = game();
  if (g) {
    if (paused !== bridge.paused) {
      paused = bridge.paused;
      paused ? g.pause('host') : g.resume();
    }
  }
  requestAnimationFrame(sync);
}
requestAnimationFrame(sync);
