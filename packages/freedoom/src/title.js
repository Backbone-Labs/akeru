import createEngine from './engine.js';
import { inputMask } from './input.js';
import { createDesktopInput } from './desktop.js';
import { createSaveClient } from './save-client.js';
const params = new URLSearchParams(location.hash.slice(1));
const nonce = params.get('nonce'),
  shell = params.get('shell');
const status = document.querySelector('#status');
const canvas = document.querySelector('canvas'),
  context = canvas.getContext('2d');
const desktop = createDesktopInput();
let dragging = false;
const hint =
  'WASD move · mouse look · click fire · E / Space use · Q / R weapon · M menu';
let sequence = 0,
  received = -1,
  connected = false,
  paused = false,
  mask = 0,
  engine,
  ready = false;
let revision = null,
  saveBlocked = false,
  saving = false;
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
async function initialize() {
  try {
    const response = await fetch('./game.wad');
    if (!response.ok) throw new Error('Missing game data');
    const wad = new Uint8Array(await response.arrayBuffer());
    engine = await createEngine();
    engine.FS.writeFile('/game.wad', wad);
    if (!engine._akeru_init()) throw new Error('Engine initialization failed');
    // Advance the deferred new-game action before restoring a live save.
    engine._akeru_tick(0);
    let restored = false;
    try {
      const record = await saves.service.read('progress');
      if (record) {
        if (
          record.schemaVersion !== 1 ||
          record.bytes.length < 196608 ||
          record.bytes.length > 1048576
        )
          throw new Error('Invalid save');
        engine.HEAPU8.set(record.bytes, engine._akeru_save());
        if (!engine._akeru_restore(record.bytes.length))
          throw new Error('Incompatible save');
        revision = record.revision;
        restored = true;
      }
    } catch {
      saveBlocked = true;
    }
    ready = true;
    status.textContent = saveBlocked
      ? 'Saves unavailable. Previous progress is preserved.'
      : restored
        ? 'Progress restored. ' + hint
        : hint;
    send('playable', { sdkVersion: '0.1.0' });
    send('actions', { supported: ['save', 'restore', 'audio'] });
    void enableAudio();
  } catch (error) {
    status.textContent =
      'Could not load the local Freedoom build. ' + error.message;
  }
}
async function persist() {
  if (!ready || saving || saveBlocked) return false;
  const size = engine._akeru_serialize();
  if (!size) return false;
  saving = true;
  try {
    const bytes = engine.HEAPU8.slice(
      engine._akeru_save(),
      engine._akeru_save() + size,
    );
    const record = await saves.service.write(
      'progress',
      { schemaVersion: 1, bytes },
      revision,
    );
    revision = record.revision;
    status.textContent = 'Progress saved in this browser.';
    return true;
  } catch (error) {
    if (error.code === 'conflict') saveBlocked = true;
    status.textContent = 'Could not save. Previous progress is preserved.';
    return false;
  } finally {
    saving = false;
  }
}
document.querySelector('#save').addEventListener('click', persist);
const nextButton = document.querySelector('#next');
if (document.title === 'FreeDM') {
  nextButton.hidden = false;
  nextButton.addEventListener('click', () => {
    if (ready) engine._akeru_restart(((engine._akeru_level() % 100) % 32) + 1);
  });
}
addEventListener('message', (event) => {
  const m = event.data;
  if (
    event.source !== parent ||
    event.origin !== shell ||
    !m ||
    m.protocol !== 'akeru.catalog.v1' ||
    m.nonce !== nonce ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence <= received
  )
    return;
  received = m.sequence;
  if (m.type === 'action' && ready) {
    void handleAction(m.payload);
    return;
  }
  if (m.type === 'save-result') return saves.receive(m.payload);
  if (m.type === 'connect' && !connected && m.payload?.sdkVersion === '0.1.0') {
    connected = true;
    document.querySelector('#game-options').hidden =
      m.payload.presentation === 'embedded';
    void initialize();
  } else if (m.type === 'input' && connected && !paused)
    mask = inputMask(m.payload);
  else if (m.type === 'pause') {
    paused = true;
    releaseInput();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    stopAudio();
    void persist();
  } else if (m.type === 'resume') {
    paused = false;
    releaseInput();
    void enableAudio();
  }
});
let lastMask = 0;
let previous = performance.now(),
  accumulator = 0,
  frame;
const audioSources = new Set();
function stopAudio() {
  for (const source of audioSources) {
    try {
      source.stop();
    } catch {
      /* already ended */
    }
  }
  audioSources.clear();
  nextAudio = audio?.currentTime ?? 0;
}
let audio,
  nextAudio = 0;
function playAudio() {
  if (!audio || audio.state !== 'running' || document.hidden) return;
  const count = engine._akeru_audio_count();
  if (!count) return;
  const data = engine.HEAPF32.subarray(
    engine._akeru_audio() / 4,
    engine._akeru_audio() / 4 + count * 2,
  );
  const buffer = audio.createBuffer(2, count, 44100);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) samples[i] = data[i * 2 + channel];
  }
  nextAudio = Math.max(
    audio.currentTime,
    Math.min(nextAudio, audio.currentTime + 0.15),
  );
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  audioSources.add(source);
  source.onended = () => audioSources.delete(source);
  source.start(nextAudio);
  nextAudio += count / 44100;
}
function draw(at) {
  accumulator += Math.min(60, Math.max(0, at - previous));
  previous = at;
  if (ready && connected && !paused && !document.hidden) {
    while (accumulator >= 1000 / engine._akeru_fps()) {
      const local = desktop.read(at);
      engine._akeru_mouse(local.x, 0);
      const combined = mask | local.mask;
      // Fire-button feedback; it does not claim the engine fired a shot.
      if (
        combined & (1 << 9) &&
        !(lastMask & (1 << 9)) &&
        engine._akeru_state() === 0
      )
        send('rumble', {
          duration: 90,
          strongMagnitude: 0.25,
          weakMagnitude: 0.5,
        });
      lastMask = combined;
      engine._akeru_tick(combined);
      playAudio();
      accumulator -= 1000 / engine._akeru_fps();
    }
    const width = engine._akeru_width(),
      height = engine._akeru_height();
    if (!frame || frame.width !== width || frame.height !== height) {
      canvas.width = width;
      canvas.height = height;
      frame = new ImageData(width, height);
    }
    frame.data.set(
      engine.HEAPU8.subarray(
        engine._akeru_pixels(),
        engine._akeru_pixels() + width * height * 4,
      ),
    );
    context.putImageData(frame, 0, 0);
  } else accumulator = 0;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
setInterval(persist, 15000);
const audioButton = document.querySelector('#audio');
const audioPrompt = document.querySelector('#enable-audio');
let muted = false;
function updateAudioUI() {
  const running = audio?.state === 'running';
  audioButton.textContent = running ? 'Sound on' : 'Sound off';
  audioButton.setAttribute('aria-pressed', String(running));
  audioPrompt.hidden = running || muted;
}
async function enableAudio() {
  if (muted) return;
  try {
    if (!audio) {
      audio = new AudioContext();
      audio.addEventListener('statechange', updateAudioUI);
    }
    let timer;
    try {
      await Promise.race([
        audio.resume(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Audio needs a gesture')),
            2000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    nextAudio = audio.currentTime;
  } catch {
    audioPrompt.textContent = 'Tap to retry sound';
  }
  updateAudioUI();
}
audioPrompt.addEventListener('click', () => void enableAudio());
audioButton.addEventListener('click', async () => {
  muted = audio?.state === 'running';
  if (muted) await audio.suspend();
  else await enableAudio();
  updateAudioUI();
});
// A real gesture inside the game unlocks Web Audio; controller messages alone
// are not a browser user activation. Keep an explicit touch fallback visible.
canvas.addEventListener('pointerdown', () => void enableAudio());
canvas.addEventListener('keydown', () => void enableAudio());

function releaseInput() {
  mask = 0;
  dragging = false;
  desktop.release();
  engine?._akeru_release();
}
addEventListener('blur', releaseInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseInput();
    stopAudio();
    void persist();
  } else if (!paused) void enableAudio();
});
addEventListener('keydown', (event) => {
  if (!ready || paused || event.target.closest?.('button, input, textarea'))
    return;
  // Escape remains the browser's pointer-lock exit action.
  if (event.code === 'Escape' && document.pointerLockElement === canvas) {
    document.exitPointerLock();
    releaseInput();
    return;
  }
  if (desktop.key(event.code, true, performance.now())) {
    event.preventDefault();
    status.textContent = hint;
  }
});
addEventListener('keyup', (event) => {
  if (desktop.key(event.code, false, performance.now())) event.preventDefault();
});
canvas.addEventListener('pointerdown', (event) => {
  if (!ready || paused || event.button !== 0) return;
  canvas.focus();
  if (event.pointerType !== 'mouse') {
    desktop.confirm(performance.now());
    return;
  }
  dragging = true;
  desktop.fire(true);
  if (document.pointerLockElement !== canvas) {
    desktop.confirm(performance.now());
    // Pointer lock is optional: keyboard remains usable if the browser declines.
    try {
      canvas.requestPointerLock()?.catch(mouseFallback);
    } catch {
      mouseFallback();
    }
  }
  status.textContent = hint;
});
function mouseFallback() {
  status.textContent = 'Drag to look · click fire · WASD move · arrows turn';
}
addEventListener('pointerup', () => {
  dragging = false;
  desktop.fire(false);
});
addEventListener('pointercancel', releaseInput);
document.addEventListener('mousemove', (event) => {
  if (!paused && (document.pointerLockElement === canvas || dragging))
    desktop.move(event.movementX, event.movementY);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    releaseInput();
    status.textContent = 'Click to capture mouse · WASD move · Enter fire';
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// The host owns these controls; no extra toolbar competes with the app overlay.

let actionBusy = false;
async function handleAction(payload) {
  if (
    !payload ||
    !Number.isSafeInteger(payload.id) ||
    !['save', 'restore', 'audio'].includes(payload.action)
  )
    return;
  const reply = (ok, message) =>
    send('action-result', { id: payload.id, ok, message });
  if (actionBusy || saving) {
    reply(false, 'A save is in progress. Try again in a moment.');
    return;
  }
  actionBusy = true;
  try {
    if (payload.action === 'save') {
      if (saveBlocked) throw new Error('Saving unavailable');
      const size = engine._akeru_serialize();
      if (!size) {
        reply(false, 'Save after returning to gameplay.');
        return;
      }
      const bytes = engine.HEAPU8.slice(
        engine._akeru_save(),
        engine._akeru_save() + size,
      );
      const previous = await saves.service.read('snapshot');
      await saves.service.write(
        'snapshot',
        { schemaVersion: 1, bytes },
        previous?.revision ?? null,
      );
      reply(true, 'Snapshot saved on this device.');
    } else if (payload.action === 'restore') {
      const record = await saves.service.read('snapshot');
      if (!record) {
        reply(false, 'No saved game yet.');
        return;
      }
      if (
        record.schemaVersion !== 1 ||
        record.bytes.length < 196608 ||
        record.bytes.length > 1048576
      )
        throw new Error('Invalid save');
      releaseInput();
      stopAudio();
      engine.HEAPU8.set(record.bytes, engine._akeru_save());
      if (!engine._akeru_restore(record.bytes.length))
        throw new Error('Incompatible save');
      reply(true, 'Saved game restored. Resume to play.');
    } else {
      muted = audio?.state === 'running' && !muted;
      if (muted) {
        stopAudio();
        await audio?.suspend();
      } else await enableAudio();
      updateAudioUI();
      reply(
        true,
        muted
          ? 'Sound off.'
          : audio?.state === 'running'
            ? 'Sound on.'
            : 'Resume, then tap the sound button in the game.',
      );
    }
  } catch {
    reply(false, 'Could not restore. Your saved data is unchanged.');
  } finally {
    actionBusy = false;
  }
}
