import { connectGame } from './host.js';
import { installControls } from './controls.js';
import { installMultiplayer } from './multiplayer.js';
let preferences = {},
  dirty = false,
  controls,
  multiplayer,
  connected = false;
const valid = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([k, v]) =>
      ['obl_settings', 'obl_name'].includes(k) &&
      typeof v === 'string' &&
      v.length < 1024,
  );
const bridge = (globalThis.akeruBlackline = {
  active: () =>
    host.active &&
    !globalThis.Game?.akeruLobbyOpen &&
    globalThis.Game?.akeruMatchReady !== false,
  storage: {
    getItem: (key) => preferences[key] ?? null,
    setItem(key, value) {
      if (valid({ [key]: value })) {
        preferences[key] = value;
        dirty = true;
      }
    },
  },
});
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
const host = connectGame({
  validate: valid,
  serialize: () => preferences,
  dirty() {
    const value = dirty;
    dirty = false;
    return value;
  },
  async start(state) {
    preferences = state ?? {};
    await import('./engine--main.js');
    controls = installControls(globalThis.Game, () => host);
    multiplayer = installMultiplayer(globalThis.Game, () => host);
    controls.controllerChanged(connected);
    bridge.leave = multiplayer.leave;
  },
  multiplayer: (event) => multiplayer?.receive(event),
  input: (frame) => controls?.input(frame),
  action: (name) => controls?.action(name),
  controllerChanged(value) {
    connected = value;
    controls?.controllerChanged(value);
  },
  pause(paused) {
    controls?.pause(paused);
    if (paused) {
      globalThis.Game?.player?._clearKeys();
      void globalThis.Game?.audio?.ctx?.suspend();
    } else void globalThis.Game?.audio?.ctx?.resume();
  },
});
