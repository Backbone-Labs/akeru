/** Dead End Dash inside Akeru's isolated title frame. One side speaks
 * `akeru.catalog.v1` to the shell; the other uses the game's own options and
 * lifecycle calls. The game source is not here: the build reads it from the
 * pinned checkout and resolves the `dead-end-dash:` imports below. */
import { createSaveClient } from './save-client.js';
import { Game } from 'dead-end-dash:src/game.js';
import { VERSION } from 'dead-end-dash:src/config.js';
import { createActions, supported } from './actions.js';
import { PROTOCOL, createGate, launchArgs } from './channel.js';
import { controlText, createHostInput } from './input.js';
import { partyUrl } from './network.js';
import { multiplayerUrl } from './network-config.js';
import { openHostStore } from './saves.js';

const launch = parent === window ? null : launchArgs(location.hash);
const { shell, nonce } = launch ?? {};
const root = document.querySelector('#ded-root');
const status = (text) => {
  document.querySelector('#akeru-status').textContent = text;
};

let sequence = 0,
  connected = false,
  ready = false,
  hostPaused = false,
  stopped = false,
  heldSound = false,
  overlay = null,
  game = null,
  store = null,
  actions = null;
const send = (type, payload) =>
  parent.postMessage(
    {
      protocol: PROTOCOL,
      nonce,
      sequence: sequence++,
      type,
      payload,
    },
    shell,
  );
const saves = createSaveClient(send);
const input = createHostInput({
  rumble(effect) {
    if (ready && !stopped) send('rumble', effect);
  },
});
/** Everything unsaved goes to the host now, including a setting the game
 * was still holding back for a moment. Rejects when saving has stopped. */
const flush = async () => {
  if (ready) await game.saveNow();
  if (store) await store.flush();
};

/** Why saving stopped, in the game's voice. What the host already holds is
 * never replaced by this session. */
const lost = (code) =>
  code === 'corrupt' || code === 'migration'
    ? 'Your saved progress could not be read and has been left untouched. Nothing from this session will be saved.'
    : code === 'conflict'
      ? 'The game is open somewhere else with newer progress. Nothing more from this session will be saved.'
      : 'Saving is unavailable here. Progress will last until you close the game.';

/** The game's typeface, read as one of this title's own data files. Title
 * origins have no font policy of their own, so it is registered from bytes;
 * without it the game falls back to the system monospace face. */
async function loadTypeface() {
  if (typeof FontFace !== 'function' || !document.fonts?.add) return;
  const load = async (weight) => {
    const response = await fetch(
      new URL(`./pixelify-sans-${weight}.woff2`, import.meta.url),
    );
    if (!response.ok) throw new Error('Typeface unavailable');
    const face = new FontFace('Pixelify Sans', await response.arrayBuffer(), {
      weight,
      style: 'normal',
    });
    document.fonts.add(await face.load());
  };
  await Promise.race([
    Promise.all([load('400'), load('700')]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]).catch(() => {});
}

/** Host menu open, or the page hidden: the game and its sound stop, nothing
 * stays held, and anything unsaved is written while there is still time. */
function applyPause() {
  if (!ready) return;
  const stop = hostPaused || document.hidden;
  if (stop === stopped) return;
  stopped = stop;
  input.neutral();
  if (stop) {
    // Sound that was playing is only suspended by the pause. Sound the
    // browser never let start is not: the pill must be able to say so.
    heldSound = game.audioStatus().state === 'running';
    game.pause();
    void flush().catch(() => {});
  } else {
    heldSound = false;
    game.resume();
  }
}

/** Akeru's touch controls belong on screen during a dash, not over the game's
 * own tappable menus. Said once per change. */
function watchPlay() {
  if (ready) {
    const visible = game.inPlay;
    if (visible !== overlay) {
      overlay = visible;
      send('touch-overlay', { visible });
    }
  }
  requestAnimationFrame(watchPlay);
}

async function start(payload) {
  try {
    store = await openHostStore(saves.service, {
      available: payload.saves?.local === 'available',
      onBlocked: (code) => game?.ready && game.storageLost(lost(code)),
    });
    await loadTypeface();
    game = new Game(root, {
      store,
      inputProvider: input,
      keyboard: true,
      styles: false,
      pauseOnBlur: false,
      // Akeru's own menu button sits in the top-right corner of the player.
      pauseButton: false,
      relayUrl: partyUrl(multiplayerUrl, location),
      controlText,
      onProgress(progress) {
        if (!ready && progress >= 0 && progress <= 1)
          send('loading', { progress });
      },
    });
    await game.initialize();
    if (store.blocked) game.storageLost(lost(store.blocked));
    actions = createActions({
      game,
      flush,
      send,
      heldSound: () => stopped && heldSound,
    });
    const resize = () => game.resize();
    addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    if (typeof ResizeObserver === 'function')
      new ResizeObserver(resize).observe(root);
    // Automated checks and bug reports read the game here; nothing else does.
    globalThis.__ded = { game, version: VERSION };
    ready = true;
    send('playable', { sdkVersion: '0.1.0' });
    send('actions', { supported: [...supported] });
    applyPause();
    requestAnimationFrame(watchPlay);
  } catch {
    status('Dead End Dash could not start. Exit and try again.');
    send('error', { code: 'initialization' });
  }
}

if (!launch) status('Open Dead End Dash from the Akeru catalog.');
else {
  const accept = createGate({ source: parent, shell, nonce });
  addEventListener('message', (event) => {
    const message = accept(event);
    if (!message) return;
    const { type, payload } = message;
    if (type === 'save-result') saves.receive(payload);
    else if (type === 'connect') {
      if (connected) return;
      connected = true;
      if (payload?.sdkVersion === '0.1.0') void start(payload);
      else {
        status('This version of Akeru cannot run Dead End Dash.');
        send('error', { code: 'unsupported' });
      }
    } else if (type === 'pause' || type === 'resume') {
      hostPaused = type === 'pause';
      applyPause();
    } else if (!ready) return;
    else if (type === 'input') {
      if (!stopped) input.receive(payload);
    } else if (type === 'controller-status')
      input.setConnected(payload?.connected === true);
    else if (type === 'action') void actions.receive(payload);
  });
  document.addEventListener('visibilitychange', applyPause);
  addEventListener('pagehide', () => {
    void flush().catch(() => {});
  });
  // Focus leaves this frame whenever a thumb lands on Akeru's own controls.
  addEventListener('blur', () => game?.blur());
  // Nothing under the game scrolls, zooms or opens a context menu.
  root.addEventListener(
    'touchmove',
    (event) => {
      if (!event.target.closest?.('.ded-screen')) event.preventDefault();
    },
    { passive: false },
  );
  root.addEventListener('dblclick', (event) => event.preventDefault());
  root.addEventListener('contextmenu', (event) => {
    if (!event.target.closest?.('.ded-input')) event.preventDefault();
  });
}
