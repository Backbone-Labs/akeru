import { mapInput, trustedMessage } from './input.js';
import { relayUrl, allowedShellOrigins } from './runtime-config.js';

const params = new URLSearchParams(location.hash.slice(1));
const shell = params.get('shell'),
  nonce = params.get('nonce');
const canvas = document.querySelector('#canvas');
const entry = document.querySelector('#entry'),
  status = document.querySelector('#status');
const progress = document.querySelector('#progress'),
  join = document.querySelector('#join');
const notice = document.querySelector('#notice');
let seq = 0,
  received = -1,
  connected = false,
  initialized = false;
let paused = false,
  muted = false,
  playing = false,
  failed = false,
  preparing = false,
  everConnected = false,
  joining = false,
  lastJoinAt = 0;
let current = mapInput(),
  last = performance.now(),
  readyAt = 0,
  noticeTimer;
let inputProvider = null,
  appliedActions = Array(8).fill(0);
const authorized =
  parent !== window &&
  allowedShellOrigins.includes(shell) &&
  /^[a-zA-Z0-9-]{16,128}$/.test(nonce ?? '');
const send = (type, payload) => {
  if (authorized)
    parent.postMessage(
      { protocol: 'akeru.catalog.v1', nonce, sequence: seq++, type, payload },
      shell,
    );
};
const engine = () => globalThis.Module;
function neutral() {
  current = mapInput();
  appliedActions = Array(8).fill(0);
  inputProvider = null;
  if (initialized) {
    try {
      engine()._akeru_reset_input();
    } catch {
      /* An aborted engine can no longer accept input. */
    }
  }
}
function announce(text, duration = 5000) {
  clearTimeout(noticeTimer);
  notice.textContent = text;
  notice.hidden = !text;
  if (duration)
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, duration);
}
function audioState() {
  if (muted) return 'off';
  return initialized && engine().akeruAudioState?.() === 'running'
    ? 'on'
    : 'blocked';
}
async function unlockAudio() {
  if (!initialized || muted) return;
  try {
    await Promise.race([
      engine().akeruResumeAudio?.(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch {
    /* Browser may require a direct tap. */
  }
  engine()._akeru_mute(Number(muted || paused));
}
function fail(message) {
  if (failed) return;
  failed = true;
  neutral();
  entry.hidden = false;
  join.hidden = true;
  progress.hidden = true;
  status.textContent = message;
  if (connected) {
    send('touch-overlay', { visible: false });
    send('actions', { supported: [] });
  }
}
function disconnected() {
  neutral();
  playing = false;
  joining = false;
  everConnected = false;
  entry.hidden = false;
  progress.hidden = true;
  join.hidden = false;
  join.dataset.reconnect = 'true';
  join.textContent = 'Reconnect ↗';
  status.textContent =
    'You left the arena. Reconnect to join the current match.';
  send('touch-overlay', { visible: false });
}
function resize() {
  // Bound mobile GPU cost without constraining the game's aspect ratio.
  const scale = Math.min(1, 1280 / innerWidth, 800 / innerHeight);
  canvas.width = Math.max(320, Math.round(innerWidth * scale));
  canvas.height = Math.max(180, Math.round(innerHeight * scale));
  if (initialized) engine()._akeru_resize?.(canvas.width, canvas.height);
}
async function startPlaying() {
  if (
    !initialized ||
    paused ||
    failed ||
    joining ||
    playing ||
    !engine()._akeru_connected() ||
    engine()._akeru_map_time() <= 0
  )
    return;
  joining = true;
  join.hidden = true;
  status.textContent = 'Entering the arena…';
  await unlockAudio();
  lastJoinAt = performance.now();
  engine()._akeru_join();
}
function enterArena() {
  joining = false;
  playing = true;
  entry.hidden = true;
  canvas.focus();
  send('touch-overlay', { visible: true });
  if (audioState() === 'blocked')
    announce('Tap the game once to enable sound.');
}

function downloadArena() {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', new URL('./red-eclipse-opt.data', import.meta.url));
    request.responseType = 'arraybuffer';
    request.timeout = 240000;
    let painted = 0;
    request.onprogress = (event) => {
      if (!event.lengthComputable || performance.now() - painted < 150) return;
      painted = performance.now();
      const fraction = Math.min(1, event.loaded / event.total);
      progress.value = fraction;
      status.textContent = `Downloading the arena… ${Math.floor(fraction * 100)}%`;
    };
    request.onload = () =>
      request.status === 200 && request.response?.byteLength
        ? resolve(request.response)
        : reject(new Error('Arena download failed'));
    request.onerror = request.ontimeout = () =>
      reject(new Error('Arena download failed'));
    request.send();
  });
}
async function boot() {
  // The entry screen is interactive while the substantial arena download runs.
  send('playable', { sdkVersion: '0.1.0' });
  send('actions', { supported: ['audio', 'audio-status'] });
  send('touch-overlay', { visible: false });
  status.textContent = 'Downloading the arena…';
  resize();
  // Compile while assets download instead of serializing both startup costs.
  const compiledEngine = WebAssembly.compileStreaming(
    fetch(new URL('./red-eclipse-opt.wasm', import.meta.url)),
  ).catch(() => null);
  let packageData;
  try {
    packageData = await downloadArena();
  } catch {
    fail('The download failed. Check your connection and reopen the game.');
    return;
  }
  if (failed) return;
  status.textContent = 'Starting the engine…';
  progress.removeAttribute('value');
  const name = 'Guest' + Math.floor(Math.random() * 90000 + 10000);
  globalThis.Module = {
    canvas,
    getPreloadedPackage: (_name, size) => {
      if (packageData.byteLength !== size)
        throw new Error('Incomplete arena download');
      const bytes = packageData;
      packageData = null;
      return bytes;
    },
    websocket: { url: relayUrl, subprotocol: 'binary' },
    arguments: [
      '-dw' + canvas.width,
      '-dh' + canvas.height,
      '-df0',
      '-xexplodewaypoints 0; smnoshadow 1; volumetric 0; grass 0; csmshadowmap 0; smsize 10; smalpha 0; smfilter 0; name ' +
        name +
        '; playerloadweap "4 8"; showloadoutmenu 0; connectguidelines 1',
    ],
    locateFile: (path) => new URL(path, import.meta.url).href,
    setStatus: (text) => {
      const match = /\((\d+)\/(\d+)\)/.exec(text ?? '');
      if (match && !initialized) {
        const fraction = Math.min(
          1,
          Number(match[1]) / Math.max(1, Number(match[2])),
        );
        progress.value = fraction;
        status.textContent = `Downloading the arena… ${Math.floor(fraction * 100)}%`;
      }
    },
    onRuntimeInitialized: () => {
      initialized = true;
      readyAt = performance.now();
      progress.removeAttribute('value');
      status.textContent = 'Connecting to the shared arena…';
      engine()._akeru_mute(Number(muted || paused));
    },
    onAbort: () =>
      fail(
        'The arena could not start on this device. Close the game and try again.',
      ),
    print: () => {},
    printErr: (text) => console.warn('[Red Eclipse]', text),
  };
  const compiled = await compiledEngine;
  if (compiled) {
    globalThis.Module.instantiateWasm = (imports, receive) => {
      WebAssembly.instantiate(compiled, imports)
        .then((instance) => receive(instance, compiled))
        .catch(() =>
          fail('The game engine could not start. Reopen the game to retry.'),
        );
      return {};
    };
  }
  const script = document.createElement('script');
  script.src = './red-eclipse-opt.js';
  script.onerror = () =>
    fail('The download failed. Check your connection and reopen the game.');
  document.head.append(script);
  setTimeout(() => {
    if (!initialized)
      fail(
        'The download is taking too long. Check your connection and reopen the game.',
      );
  }, 240000);
}
async function action(p) {
  if (!Number.isSafeInteger(p?.id)) return;
  let ok = !failed;
  if (failed) {
    send('action-result', {
      id: p.id,
      ok: false,
      message: 'Close and reopen the game to try again.',
      state: {},
    });
    return;
  }
  if (p.action === 'audio') {
    muted =
      audioState() === 'on' ||
      (!muted && paused && engine()?.akeruAudioState?.() === 'running');
    if (initialized) engine()._akeru_mute(Number(muted || paused));
    if (!muted) await unlockAudio();
  } else if (p.action !== 'audio-status') ok = false;
  const state = audioState();
  send('action-result', {
    id: p.id,
    ok,
    message: !ok
      ? 'This live multiplayer match cannot be saved or restarted.'
      : state === 'on'
        ? 'Sound on.'
        : state === 'off'
          ? 'Sound off.'
          : 'Resume and tap the game to enable sound.',
    state: { audioState: state },
  });
}
addEventListener('message', (event) => {
  if (!authorized || !trustedMessage(event, shell, nonce, parent, received))
    return;
  const m = event.data;
  received = m.sequence;
  if (m.type === 'connect' && !connected && m.payload?.sdkVersion === '0.1.0') {
    connected = true;
    boot();
  } else if (!connected) return;
  else if (m.type === 'input' && !paused && !failed) {
    if (m.payload?.connected === false) neutral();
    else if (['gamepad', 'touch'].includes(m.payload?.provider)) {
      if (inputProvider !== m.payload.provider) neutral();
      inputProvider = m.payload.provider;
      current = mapInput(m.payload);
      if (!playing && current.actions[2]) activateEntry();
    }
  } else if (m.type === 'pause') {
    paused = true;
    neutral();
    if (initialized) engine()._akeru_mute(1);
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (m.type === 'resume') {
    paused = false;
    neutral();
    if (initialized) {
      engine()._akeru_mute(Number(muted));
      void unlockAudio();
    }
  } else if (m.type === 'action') void action(m.payload);
});
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (initialized && !failed) {
    if (!preparing && engine()._akeru_frame_count() > 0) {
      preparing = true;
      status.textContent = 'Joining the arena and preparing graphics…';
      setTimeout(() => {
        engine()._akeru_prepare_and_connect();
        readyAt = performance.now();
        status.textContent = 'Connecting to the shared arena…';
      }, 50);
    }
    const online = Boolean(engine()._akeru_connected());
    if (online) everConnected = true;
    if (playing && everConnected && !online) disconnected();
    if (joining && online && !paused) {
      if (engine()._akeru_player_ready()) enterArena();
      else if (now - lastJoinAt > 2000) {
        lastJoinAt = now;
        engine()._akeru_join();
      }
    }
    if (!playing && !joining && online && engine()._akeru_map_time() > 0) {
      progress.hidden = true;
      join.hidden = false;
      status.textContent = 'Arena ready. Jump in.';
    } else if (!playing && !join.dataset.reconnect && now - readyAt > 180000)
      fail(
        'The multiplayer server did not respond. Close the game and try again.',
      );
    if (playing && inputProvider && !paused && !document.hidden) {
      engine()._akeru_move(current.x, current.y);
      engine()._akeru_look(current.yaw * 150 * dt, current.pitch * 115 * dt);
      current.actions.forEach((down, id) => {
        if (down !== appliedActions[id]) engine()._akeru_action(id, down);
      });
      appliedActions = [...current.actions];
    }
  }
  requestAnimationFrame(frame);
}
function activateEntry() {
  if (paused || !initialized) return;
  if (join.dataset.reconnect) {
    neutral();
    delete join.dataset.reconnect;
    join.hidden = true;
    join.textContent = 'Enter the arena ↗';
    failed = false;
    playing = false;
    everConnected = false;
    status.textContent = 'Reconnecting to the arena…';
    engine()._akeru_reconnect();
    readyAt = performance.now();
  } else void startPlaying();
}
join.addEventListener('click', activateEntry);
canvas.addEventListener('pointerdown', (event) => {
  if (paused || !playing) return;
  if (event.pointerType === 'mouse' && inputProvider) neutral();
  void unlockAudio();
  if (event.pointerType === 'mouse' && !document.pointerLockElement) {
    try {
      Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    } catch {
      /* Optional browser permission. */
    }
  }
});
canvas.addEventListener('keydown', () => {
  if (inputProvider) neutral();
});
addEventListener('resize', resize);
addEventListener('blur', neutral);
addEventListener('visibilitychange', () => {
  if (document.hidden) neutral();
});
addEventListener('pagehide', () => {
  neutral();
  if (initialized) engine()._akeru_leave();
});
if (!authorized) {
  status.textContent = 'Open this game from the Akeru catalog.';
  progress.hidden = true;
}
requestAnimationFrame(frame);

const credits = document.querySelector('#credits');
document
  .querySelector('#credits-link')
  .addEventListener('click', async (event) => {
    event.preventDefault();
    credits.showModal();
    credits.querySelector('pre').textContent = 'Loading credits…';
    try {
      const response = await fetch('./CREDITS.md');
      if (!response.ok) throw new Error('Unavailable');
      credits.querySelector('pre').textContent = await response.text();
    } catch {
      credits.querySelector('pre').textContent =
        'Credits could not load. You can also find them on this game’s Akeru details page.';
    }
  });
document
  .querySelector('#credits-close')
  .addEventListener('click', () => credits.close());
