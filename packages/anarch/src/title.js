import createEngine from './engine.js';
import { inputMask } from './input.js';
import { createSaveClient } from './save-client.js';
const params = new URLSearchParams(location.hash.slice(1));
const nonce = params.get('nonce'),
  shell = params.get('shell');
const status = document.querySelector('#status');
const canvas = document.querySelector('canvas'),
  context = canvas.getContext('2d');
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
        ? 'Progress restored.'
        : 'Ready. Press A to begin.';
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
    mask = 0;
    void persist();
  } else if (m.type === 'resume') {
    paused = false;
    mask = 0;
  }
});
let previous = performance.now();
const frame = new ImageData(320, 200);
function draw(at) {
  const elapsed = Math.min(50, Math.max(0, Math.round(at - previous)));
  previous = at;
  if (ready && connected && !paused) {
    engine._akeru_tick(elapsed, mask);
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
    audioButton.textContent = 'Enable sound';
  } else {
    await audio.resume();
    nextAudio = audio.currentTime;
    audioButton.textContent = 'Mute sound';
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
