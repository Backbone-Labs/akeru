import { createSaveClient } from './save-client.js';
/** Original Akeru conformance fixture, MIT. No upstream game code or assets. */
const params = new URLSearchParams(location.hash.slice(1)),
  nonce = params.get('nonce'),
  shell = params.get('shell');
let sequence = 0,
  received = -1,
  connected = false,
  paused = false,
  x = 0,
  y = 0,
  axes = {},
  buttons = {};
const status = document.querySelector('#status'),
  orb = document.querySelector('#orb');
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
const saveClient = createSaveClient(send);
let savedRevision = null,
  persistedPosition = null,
  saveBusy = false,
  loaded = false,
  saveBlocked = false;
const saveStatus = document.querySelector('#save-status');
async function loadPosition() {
  try {
    const record = await saveClient.service.read('position');
    if (record) {
      const value = JSON.parse(new TextDecoder().decode(record.bytes));
      if (
        record.schemaVersion !== 1 ||
        !Number.isFinite(value.x) ||
        !Number.isFinite(value.y) ||
        Math.abs(value.x) > 120 ||
        Math.abs(value.y) > 65
      )
        throw new Error('Invalid position');
      x = value.x;
      y = value.y;
      savedRevision = record.revision;
      persistedPosition = JSON.stringify({ x, y });
    }
    loaded = true;
    saveStatus.textContent = record
      ? 'Progress restored from this browser.'
      : 'Progress saves in this browser.';
  } catch {
    saveBlocked = true;
    loaded = true;
    saveStatus.textContent =
      'Saves unavailable or need recovery. Play can continue without replacing existing progress.';
  }
}
async function persistPosition() {
  const position = JSON.stringify({ x, y });
  if (
    !connected ||
    !loaded ||
    saveBusy ||
    saveBlocked ||
    position === persistedPosition
  )
    return;
  saveBusy = true;
  try {
    const record = await saveClient.service.write(
      'position',
      { schemaVersion: 1, bytes: new TextEncoder().encode(position) },
      savedRevision,
    );
    savedRevision = record.revision;
    persistedPosition = position;
    saveStatus.textContent = 'Progress saved in this browser.';
  } catch (error) {
    if (error.code === 'conflict') saveBlocked = true;
    saveStatus.textContent =
      error.code === 'conflict'
        ? 'Another session changed this save. Reopen the game to load it.'
        : 'Couldn’t save. Your previous saved progress is preserved.';
  } finally {
    saveBusy = false;
  }
}
setInterval(persistPosition, 750);
function reset() {
  axes = {};
  buttons = {};
}
window.addEventListener('message', (event) => {
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
  if (m.type === 'save-result') {
    saveClient.receive(m.payload);
    return;
  }
  if (m.type === 'connect' && !connected && m.payload?.sdkVersion === '0.1.0') {
    connected = true;
    status.textContent = 'Ready when you are.';
    send('playable', { sdkVersion: '0.1.0' });
    void loadPosition();
  } else if (connected && m.type === 'input' && !paused) {
    axes = m.payload.axes;
    buttons = m.payload.buttons;
    status.textContent = `${m.payload.provider === 'gamepad' ? 'Controller' : 'Touch'} input connected`;
  } else if (m.type === 'pause') {
    void persistPosition();
    paused = true;
    reset();
    status.textContent = 'Paused';
  } else if (m.type === 'resume') {
    paused = false;
    reset();
    status.textContent = 'Ready when you are.';
  }
});
let previous = performance.now();
function draw(at) {
  const dt = Math.min(32, at - previous) / 16;
  previous = at;
  if (connected && loaded && !paused) {
    x = Math.max(
      -120,
      Math.min(
        120,
        x +
          ((axes.moveX ?? axes.leftX ?? 0) +
            (buttons.right ?? 0) -
            (buttons.left ?? 0)) *
            2 *
            dt,
      ),
    );
    y = Math.max(
      -65,
      Math.min(
        65,
        y +
          ((axes.moveY ?? axes.leftY ?? 0) +
            (buttons.down ?? 0) -
            (buttons.up ?? 0)) *
            2 *
            dt,
      ),
    );
    orb.style.transform = `translate(${x}px, ${y}px)`;
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
