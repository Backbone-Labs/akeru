import createEngine from './engine.js';
import { createSaveClient } from './save-client.js';
import { normalizeInput, decodeSave } from './input.js';
const params = new URLSearchParams(location.hash.slice(1)),
  nonce = params.get('nonce'),
  shell = params.get('shell');
const canvas = document.querySelector('canvas'),
  status = document.querySelector('#status'),
  direction = document.querySelector('#direction'),
  powerLabel = document.querySelector('#power');
let sequence = 0,
  received = -1,
  connected = false,
  paused = false,
  engine,
  ready = false,
  input = normalizeInput(),
  angle = 0,
  power = 0.45,
  revision = null,
  saveBlocked = false,
  saving = false,
  savedDirty = 0,
  selectedCourse = 0,
  selectionAt = 0;
const keys = new Set();
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
    let bytes;
    try {
      const record = await saves.service.read('progress');
      if (record) {
        if (record.schemaVersion !== 1) throw new Error('Schema');
        bytes = decodeSave(record.bytes);
        revision = record.revision;
      }
    } catch {
      saveBlocked = true;
    }
    engine = await createEngine({
      canvas,
      print: () => {},
      printErr: (message) => console.error(message),
      preRun: [
        (mod) => {
          mod.FS.mkdir('/opengolf_persistent_data');
          if (bytes)
            mod.FS.writeFile('/opengolf_persistent_data/storage.json', bytes);
        },
      ],
    });
    if (paused) engine._akeru_pause(1);
  } catch (error) {
    status.textContent =
      'Open Golf could not start. WebGL2 and the local WASM build are required.';
    console.error(error);
  }
}
async function persist() {
  if (
    !ready ||
    saving ||
    saveBlocked ||
    (engine.akeruSaveDirty || 0) === savedDirty
  )
    return;
  saving = true;
  const dirty = engine.akeruSaveDirty || 0;
  try {
    const bytes = decodeSave(
      engine.FS.readFile('/opengolf_persistent_data/storage.json'),
    );
    const record = await saves.service.write(
      'progress',
      { schemaVersion: 1, bytes },
      revision,
    );
    revision = record.revision;
    savedDirty = dirty;
  } catch (error) {
    if (error.code === 'conflict') saveBlocked = true;
    status.textContent = 'Could not save. Previous progress is preserved.';
  } finally {
    saving = false;
  }
}
function confirm() {
  if (!ready || paused) return;
  if (engine._akeru_state() === 0) engine._akeru_start(selectedCourse);
  else engine._akeru_confirm();
  if (engine._akeru_state() === 2) engine._akeru_shoot(angle, power);
}
function release() {
  keys.clear();
  input = normalizeInput();
  engine?._akeru_release();
}
function menu() {
  if (ready && !paused) engine._akeru_menu();
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
  } else if (m.type === 'input' && connected && !paused) {
    const next = normalizeInput(m.payload);
    if (next.confirm && !input.confirm) confirm();
    if (next.menu && !input.menu) menu();
    input = next;
  } else if (m.type === 'pause') {
    paused = true;
    release();
    engine?._akeru_pause(1);
    void persist();
  } else if (m.type === 'resume') {
    paused = false;
    release();
    engine?._akeru_pause(0);
  }
});
document.querySelector('#putt').addEventListener('click', confirm);
document.querySelector('#menu').addEventListener('click', menu);
addEventListener('keydown', (event) => {
  if (!ready || paused || event.target.closest?.('button')) return;
  if (
    [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'KeyA',
      'KeyD',
      'KeyW',
      'KeyS',
      'Enter',
      'Space',
      'KeyM',
    ].includes(event.code)
  ) {
    event.preventDefault();
    if (!event.repeat) {
      if (event.code === 'Enter' || event.code === 'Space') confirm();
      if (event.code === 'KeyM') menu();
    }
    keys.add(event.code);
  }
});
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('blur', release);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    release();
    void persist();
  }
});
let previous = performance.now();
function draw(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (engine && !ready && engine._akeru_state() >= 0) {
    ready = true;
    send('playable', { sdkVersion: '0.1.0' });
  }
  if (ready && !paused) {
    const x =
      input.x +
      Number(keys.has('ArrowRight') || keys.has('KeyD')) -
      Number(keys.has('ArrowLeft') || keys.has('KeyA'));
    const y =
      input.y +
      Number(keys.has('ArrowDown') || keys.has('KeyS')) -
      Number(keys.has('ArrowUp') || keys.has('KeyW'));
    if (engine._akeru_state() === 0 && Math.abs(x) > 0.3 && now > selectionAt) {
      selectedCourse = (selectedCourse + (x > 0 ? 1 : 19)) % 20;
      selectionAt = now + 220;
    }
    angle += x * dt * 1.8;
    power = Math.max(0.05, Math.min(1, power - y * dt * 0.45));
    direction.style.transform = `rotate(${angle}rad)`;
    powerLabel.textContent = `Power ${Math.round(power * 100)}%`;
    const state = engine._akeru_state();
    status.textContent = saveBlocked
      ? 'Saves unavailable. Existing progress preserved.'
      : state === 0
        ? `Choose course ${selectedCourse + 1} / 20 · left/right select · Enter / A play`
        : state === 6
          ? 'Hole complete! Press Enter / A for the next course.'
          : `Hole ${engine._akeru_level() + 1} · ${engine._akeru_strokes()} strokes${state === 4 ? ' · Ball rolling…' : ''}`;
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
setInterval(persist, 1000);
