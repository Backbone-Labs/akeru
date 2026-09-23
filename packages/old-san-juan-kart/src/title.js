import { connectGame } from './host.js';
// Convert pinned upstream presentation attributes through CSSOM, keeping CSP strict.
new MutationObserver(() => {
  document.querySelectorAll('[data-akeru-style]').forEach((el) => {
    for (const declaration of el.getAttribute('data-akeru-style').split(';')) {
      const split = declaration.indexOf(':');
      if (split > 0)
        el.style.setProperty(
          declaration.slice(0, split),
          declaration.slice(split + 1),
        );
    }
    el.removeAttribute('data-akeru-style');
  });
}).observe(document.body, { childList: true, subtree: true });
const neutral = () => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  item: false,
});
let preferences = {};
let dirty = false;
const bridge = (globalThis.akeruKart = {
  controls: neutral(),
  active: () => host.active,
  storage: {
    getItem: (key) => preferences[key] ?? null,
    setItem(key, value) {
      if (
        key === 'oldSanJuanKart.audio' &&
        typeof value === 'string' &&
        value.length < 2048
      ) {
        preferences[key] = value;
        dirty = true;
      }
    },
  },
});
function race() {
  if (!host.active) return;
  if (
    globalThis.__game?.state === 'menu' ||
    globalThis.__game?.state === 'results'
  ) {
    bridge.race();
    document.body.dataset.racing = 'true';
  }
  globalThis.__game?.audio.resume();
}
const host = connectGame({
  validate: (v) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length <= 1 &&
    Object.entries(v).every(
      ([k, x]) =>
        k === 'oldSanJuanKart.audio' &&
        typeof x === 'string' &&
        x.length < 2048,
    ),
  serialize: () => preferences,
  dirty() {
    const value = dirty;
    dirty = false;
    return value;
  },
  async start(state) {
    preferences = state ?? {};
    await import('./src--main.js');
  },
  input({ buttons, axes }) {
    bridge.controls = {
      throttle: buttons.confirm || 0,
      brake: buttons.cancel || 0,
      steer: axes.moveX || (buttons.right || 0) - (buttons.left || 0),
      drift: buttons.down > 0.5,
      item: buttons.up > 0.5,
    };
  },
  action(action) {
    if (action === 'confirm') race();
  },
  controllerChanged(connected) {
    document.body.dataset.controller = String(connected);
    if (!connected) bridge.controls = neutral();
  },
  pause(paused) {
    bridge.controls = neutral();
    const game = globalThis.__game;
    game?.input.keys.clear();
    if (game)
      game.input.touch = {
        steer: 0,
        throttle: 0,
        brake: 0,
        drift: false,
        item: false,
      };
    if (paused) void game?.audio.ctx?.suspend();
    else game?.audio.resume();
  },
});
document.querySelector('#race').addEventListener('click', race);
