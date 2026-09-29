import { createSaveClient } from './save-client.js';
import { createStorage, validStorage } from './storage.js';
import { createNavigation } from './navigation.js';
const empty = () => ({ buttons: {}, axes: {} });
export function connectCreator(config) {
  const args = new URLSearchParams(location.hash.slice(1));
  const shell = args.get('shell'),
    nonce = args.get('nonce');
  let sequence = 0,
    received = -1,
    connected = false,
    ready = false,
    paused = true,
    dirty = false,
    saving = false,
    blocked = false,
    revision = null;
  let controls = empty(),
    previous = {},
    swap = false;
  const getGame = () => globalThis[config.handle];
  const status = (text) => {
    document.querySelector('#akeru-status').textContent = text;
  };
  const send = (type, payload) =>
    parent.postMessage(
      {
        protocol: 'akeru.catalog.v1',
        nonce,
        sequence: sequence++,
        type,
        payload,
      },
      shell,
    );
  const saves = createSaveClient(send);
  const storage = createStorage(config.keys, () => {
    dirty = true;
  });
  const flush = async () => {
    if (!ready || !dirty || saving || blocked) return;
    dirty = false;
    saving = true;
    try {
      const r = await saves.service.write(
        'progress',
        {
          schemaVersion: 1,
          bytes: new TextEncoder().encode(JSON.stringify(storage.serialize())),
        },
        revision,
      );
      revision = r.revision;
    } catch {
      blocked = true;
      status('Saving unavailable. Existing progress is preserved.');
    } finally {
      saving = false;
    }
  };
  const navigation = createNavigation(getGame);
  const playing = () => {
    const game = getGame();
    return (
      game?.ui.screen === 'game' &&
      !game.ui.isPaused?.() &&
      !game.ui._tutMode &&
      !document.querySelector('.modal-layer.is-visible:not(.pause-layer)')
    );
  };
  const clear = () => {
    controls = empty();
    previous = {};
    swap = false;
    const game = getGame();
    game?.keys?.down.clear();
    game?.keys?.pressedThisFrame.clear();
    game?.input?.down.clear();
    game?.input?.pressed.clear();
    if (game?.input?.mouse) {
      game.input.mouse.l = false;
      game.input.mouse.r = false;
    }
    if (game?.net?.inGame) game.net.sendInput(config.idle);
  };
  const bridge = (globalThis.akeruCreator = {
    storage,
    noGamepads: () => [],
    get paused() {
      return paused || document.hidden;
    },
    get controls() {
      return controls;
    },
    takeSwap() {
      const value = swap;
      swap = false;
      return value;
    },
    readInput(keyboard, primary = true) {
      if (bridge.paused || !playing()) return { ...config.idle };
      return config.input(keyboard, primary ? controls : empty(), getGame());
    },
  });
  const pause = (value) => {
    paused = value;
    clear();
    const game = getGame();
    if (value || document.hidden) {
      config.beforeSave?.(game);
      void flush();
      void game?.sfx?.ctx?.suspend();
    } else void game?.sfx?.ctx?.resume().catch(() => {});
  };
  // Convert presentation styles through CSSOM instead of allowing inline scripts/styles.
  const styles = () =>
    document.querySelectorAll('[data-akeru-style]').forEach((el) => {
      for (const decl of el.getAttribute('data-akeru-style').split(';')) {
        const i = decl.indexOf(':');
        if (i > 0)
          el.style.setProperty(
            decl.slice(0, i).trim(),
            decl.slice(i + 1).trim(),
          );
      }
      el.removeAttribute('data-akeru-style');
    });
  new MutationObserver(styles).observe(document.body, {
    childList: true,
    subtree: true,
  });
  addEventListener('message', async (e) => {
    const m = e.data;
    if (
      e.source !== parent ||
      e.origin !== shell ||
      m?.protocol !== 'akeru.catalog.v1' ||
      m.nonce !== nonce ||
      !Number.isSafeInteger(m.sequence) ||
      m.sequence <= received
    )
      return;
    received = m.sequence;
    if (m.type === 'save-result') {
      saves.receive(m.payload);
      return;
    }
    if (
      m.type === 'connect' &&
      !connected &&
      m.payload?.sdkVersion === '0.1.0'
    ) {
      connected = true;
      try {
        const r = await saves.service.read('progress');
        if (r) {
          const state = JSON.parse(new TextDecoder().decode(r.bytes));
          if (r.schemaVersion !== 1 || !validStorage(state, config.keys))
            throw new Error('Invalid progress');
          storage.hydrate(state);
          revision = r.revision;
        }
      } catch {
        blocked = true;
        status('Saving unavailable. Existing progress is preserved.');
      }
      try {
        await import('./main.js');
        ready = true;
        styles();
        config.setup?.(getGame());
        send('playable', { sdkVersion: '0.1.0' });
      } catch {
        status('This game could not start. Exit and try again.');
        send('error', { code: 'initialization' });
      }
    } else if (m.type === 'input' && ready && !bridge.paused) {
      const valid = (record) =>
        Object.fromEntries(
          Object.entries(record ?? {})
            .filter(([, v]) => Number.isFinite(v))
            .map(([k, v]) => [k, Math.max(-1, Math.min(1, v))]),
        );
      controls = {
        buttons: valid(m.payload?.buttons),
        axes: valid(m.payload?.axes),
      };
      const pressed = (k) => controls.buttons[k] > 0.5 && !(previous[k] > 0.5);
      const game = getGame();
      if (!playing()) {
        navigation.update(controls, performance.now());
        if (pressed('confirm')) {
          if (game.ui.screen === 'title') game.ui.show('menu');
          else navigation.activate();
        }
        if (pressed('cancel')) navigation.back();
      } else {
        if (pressed('north')) swap = true;
        config.action?.(controls, previous, game);
      }
      previous = { ...controls.buttons };
    } else if (m.type === 'pause') pause(true);
    else if (m.type === 'resume') pause(false);
    else if (m.type === 'controller-status' && m.payload?.connected === false)
      clear();
  });
  const animate = (now) => {
    if (ready && !bridge.paused && !playing()) navigation.update(controls, now);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
  addEventListener('blur', clear);
  addEventListener('pagehide', () => {
    config.beforeSave?.(getGame());
    void flush();
    getGame()?.net?.close();
  });
  document.addEventListener('visibilitychange', () => {
    clear();
    if (document.hidden) {
      config.beforeSave?.(getGame());
      void flush();
      void getGame()?.sfx?.ctx?.suspend();
    }
  });
  setInterval(() => {
    config.beforeSave?.(getGame());
    void flush();
  }, 1000);
  return bridge;
}
