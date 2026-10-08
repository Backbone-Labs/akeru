import { createController } from './controller.js';
import { connectCreator } from './bridge.js';
import { serverUrl } from './runtime-config.js';
if (serverUrl) globalThis.BUBBLEKICK_SERVER = serverUrl;
const game = () => globalThis.__bubblekick?.game;
const controller = createController();

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
    controller.update(controls);
    return true;
  },
  clear() {
    controller.clear();
    game()?.input?.clearAll();
  },
});
bridge.noGamepads = controller.read;
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
