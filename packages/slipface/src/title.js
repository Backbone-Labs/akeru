// Akeru adapter for Slipface. Runs inside the isolated title frame and owns the
// authenticated host channel.
//
// The game is the pinned source, unpatched. It already takes everything it
// needs from outside through createGame's `services`, so this file only has
// to supply them: the host's controller, the host's save slot and the host's
// rumble. The game keeps its own keyboard and draws its own touch controls.
// It cannot read a controller or open storage by itself: the build recipe
// leaves those modules out and refuses a source that reaches for them.
import { createSaveClient } from './save-client.js';
import { createGame } from './game.js';
import { readSave } from './persist--schema.js';
import { active, help, readControls, toInput } from './controls.js';
import { createProgress } from './progress.js';
import { createPill } from './pill.js';

const PROTOCOL = 'akeru.catalog.v1';
const SDK_VERSION = '0.1.0';
const RUMBLE_GAP_MS = 100;

const args = new URLSearchParams(location.hash.slice(1));
const shell = args.get('shell');
const nonce = args.get('nonce');
const status = (text) => {
  document.querySelector('#akeru-status').textContent = text;
};

let sequence = 0;
let received = -1;
let connected = false;
let ready = false;
let failed = false;
let paused = false;
let game = null;
// The host's latest controller snapshot. It stands until the next one;
// null is "nothing held".
let controls = null;
let controllerThere = false;
let controllerUsed = false;
// Ask the game for its own pause menu on its next frame.
let openPauseMenu = false;
// Sound was playing when the host paused, so its silence is the host's doing.
let audioHeld = false;
let loadingSent = -1;
let unsupported = false;
let lastRumble = -Infinity;
let embedded = false;

const send = (type, payload) =>
  parent.postMessage(
    { protocol: PROTOCOL, nonce, sequence: sequence++, type, payload },
    shell,
  );
const saves = createSaveClient(send);
const progress = createProgress({
  service: saves.service,
  readSave,
  onBlocked: () =>
    status('Saving unavailable. Existing progress is preserved.'),
});
const pill = createPill({
  game: () => game,
  send,
  flush: () => progress.storage.save(game.serialize()),
  audioHeld: () => paused && audioHeld,
});

const release = () => {
  controls = null;
  openPauseMenu = false;
};

function fail(code) {
  if (failed) return;
  failed = true;
  ready = false;
  release();
  status(
    code === 'unsupported'
      ? 'Slipface cannot run in this browser.'
      : 'Slipface could not start. Exit and try again.',
  );
  send('error', { code });
}

const services = {
  controller: {
    sample() {
      if (paused) return null;
      if (openPauseMenu) {
        openPauseMenu = false;
        return { pause: true };
      }
      return controls ? toInput(controls) : null;
    },
    connected: () => controllerThere,
    help,
  },
  haptics: {
    // The shell owns the motors, the player's consent and the final say.
    pulse(duration, strongMagnitude, weakMagnitude) {
      const now = performance.now();
      if (
        !ready ||
        paused ||
        document.hidden ||
        now - lastRumble < RUMBLE_GAP_MS
      )
        return;
      lastRumble = now;
      const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
      send('rumble', {
        duration: Math.max(1, Math.min(500, Math.round(Number(duration) || 0))),
        strongMagnitude: unit(strongMagnitude),
        weakMagnitude: unit(weakMagnitude),
      });
    },
  },
  storage: progress.storage,
  // In the direct player the shell keeps its menu button over the frame's
  // top right corner (44 px, 8 px in). The distance card moves in beside it.
  hostOverlay: () =>
    embedded ? { topRight: { width: 56, height: 56 } } : null,
  report: {
    progress(fraction) {
      // Only while loading, and only a handful of messages: the host budgets them.
      const step = Math.floor(Math.max(0, Math.min(1, fraction)) * 5);
      if (ready || failed || step <= loadingSent) return;
      loadingSent = step;
      send('loading', { progress: step / 5 });
    },
    error(problem) {
      if (problem?.code === 'unsupported') unsupported = true;
      // The game shows recoverable errors itself, with a way to carry on.
      if (ready && problem?.recoverable === false) fail('fatal');
    },
  },
};

async function start() {
  await progress.open();
  game = createGame({
    root: document.querySelector('#slipface'),
    services,
  });
  // For automated checks of the built title. The frame is this title's alone.
  globalThis.slipface = game;
  await game.initialize();
  ready = true;
  send('playable', { sdkVersion: SDK_VERSION });
  send('actions', { supported: pill.supported });
  // Slipface draws its own thumb stick and buttons.
  send('touch-overlay', { visible: false });
  if (paused) game.pause();
}

function setPaused(value) {
  paused = value;
  release();
  if (!game || !ready) return;
  if (value) {
    audioHeld = game.status().audio?.status === 'running';
    game.pause();
  } else {
    game.resume();
    // The player has just acted in the shell; ask again for sound on that strength.
    game.unlockAudio();
  }
}

if (shell && nonce) {
  addEventListener('message', async (e) => {
    const m = e.data;
    if (
      e.source !== parent ||
      e.origin !== shell ||
      m?.protocol !== PROTOCOL ||
      m.nonce !== nonce ||
      !Number.isSafeInteger(m.sequence) ||
      m.sequence <= received
    )
      return;
    received = m.sequence;
    if (m.type === 'save-result') {
      saves.receive(m.payload);
    } else if (
      m.type === 'connect' &&
      !connected &&
      m.payload?.sdkVersion === SDK_VERSION
    ) {
      connected = true;
      embedded = m.payload.presentation === 'embedded';
      try {
        await start();
      } catch {
        fail(unsupported ? 'unsupported' : 'initialization');
      }
    } else if (m.type === 'pause') setPaused(true);
    else if (m.type === 'resume') setPaused(false);
    else if (
      m.type === 'controller-status' &&
      typeof m.payload?.connected === 'boolean'
    ) {
      controllerThere = m.payload.connected;
      if (!controllerThere) {
        const state = ready && !paused ? game.status() : null;
        release();
        // Losing the controller you were riding with should not cost the run.
        openPauseMenu =
          controllerUsed && state?.mode === 'run' && state.paused === false;
        controllerUsed = false;
      }
    } else if (m.type === 'input' && ready && !paused) {
      controls =
        m.payload?.connected === false ? null : readControls(m.payload);
      if (controls && active(controls)) controllerUsed = true;
    } else if (m.type === 'action' && ready) await pill.receive(m.payload);
  });
  // Whatever was held when the page went away is not held when it comes back.
  document.addEventListener('visibilitychange', release);
  addEventListener('pagehide', release);
} else status('Open Slipface from Akeru to play.');
