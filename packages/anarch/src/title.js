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
const hint = 'WASD move · mouse look · click fire · Space jump · M menu';
let sequence = 0,
  received = -1,
  connected = false,
  paused = false,
  mask = 0,
  engine,
  ready = false;
let revision = null,
  savedDirty = 0,
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
    engine = await createEngine();
    let restored = false;
    try {
      const record = await saves.service.read('progress');
      if (record) {
        if (record.schemaVersion !== 1 || record.bytes.length !== 12)
          throw new Error('Invalid save');
        engine.HEAPU8.set(record.bytes, engine._akeru_save());
        revision = record.revision;
        restored = true;
      }
    } catch {
      saveBlocked = true;
    }
    engine._akeru_init(restored ? 1 : 0);
    ready = true;
    status.textContent = saveBlocked
      ? 'Saves unavailable. Existing progress will be preserved.'
      : restored
        ? 'Progress restored. Click or press Enter / A to play.'
        : 'Click or press Enter / A to play.';
    send('playable', { sdkVersion: '0.1.0' });
  } catch {
    status.textContent =
      'Could not load Anarch. Rebuild the local game and try again.';
  }
}
async function persist() {
  if (!ready || saving || saveBlocked || engine._akeru_dirty() === savedDirty)
    return;
  saving = true;
  const dirty = engine._akeru_dirty();
  try {
    const bytes = engine.HEAPU8.slice(
      engine._akeru_save(),
      engine._akeru_save() + 12,
    );
    const record = await saves.service.write(
      'progress',
      { schemaVersion: 1, bytes },
      revision,
    );
    revision = record.revision;
    savedDirty = dirty;
    status.textContent = 'Progress saved in this browser.';
  } catch (error) {
    if (error.code === 'conflict') saveBlocked = true;
    status.textContent = 'Could not save. Previous progress is preserved.';
  } finally {
    saving = false;
  }
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
  if (m.type === 'save-result') return saves.receive(m.payload);
  if (m.type === 'connect' && !connected && m.payload?.sdkVersion === '0.1.0') {
    connected = true;
    void initialize();
  } else if (m.type === 'input' && connected && !paused)
    mask = inputMask(m.payload);
  else if (m.type === 'pause') {
    paused = true;
    releaseInput();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    void persist();
  } else if (m.type === 'resume') {
    paused = false;
    releaseInput();
  }
});
let previous = performance.now();
const frame = new ImageData(320, 200);
function draw(at) {
  const elapsed = Math.min(50, Math.max(0, Math.round(at - previous)));
  previous = at;
  if (ready && connected && !paused) {
    const local = desktop.read(at);
    engine._akeru_mouse(local.x, local.y);
    engine._akeru_tick(elapsed, mask | local.mask);
    frame.data.set(
      engine.HEAPU8.subarray(
        engine._akeru_pixels(),
        engine._akeru_pixels() + 320 * 200 * 4,
      ),
    );
    context.putImageData(frame, 0, 0);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
setInterval(persist, 750);

let audio,
  nextAudio = 0;
const audioButton = document.querySelector('#audio');
audioButton.addEventListener('click', async () => {
  const fresh = !audio;
  audio ??= new AudioContext();
  if (!fresh && audio.state === 'running') {
    await audio.suspend();
    audioButton.textContent = 'Sound off';
  } else {
    await audio.resume();
    nextAudio = audio.currentTime;
    audioButton.textContent = 'Sound on';
  }
});
setInterval(() => {
  if (
    !ready ||
    paused ||
    document.hidden ||
    !audio ||
    audio.state !== 'running'
  )
    return;
  if (nextAudio < audio.currentTime) nextAudio = audio.currentTime;
  while (nextAudio < audio.currentTime + 0.15) {
    const ptr = engine._akeru_audio() / 4;
    const buffer = audio.createBuffer(1, 800, 8000);
    buffer.copyToChannel(engine.HEAPF32.subarray(ptr, ptr + 800), 0);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(nextAudio);
    nextAudio += 0.1;
  }
}, 50);

function releaseInput() {
  mask = 0;
  dragging = false;
  desktop.release();
  engine?._akeru_release();
}
addEventListener('blur', releaseInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseInput();
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
