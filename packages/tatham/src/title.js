import { validateSave } from './save.js';
import { createSaveClient } from './save-client.js';
const config = JSON.parse(document.querySelector('#title-config').textContent);
const params = new URLSearchParams(location.hash.slice(1)),
  nonce = params.get('nonce'),
  shell = params.get('shell');
const canvas = document.querySelector('canvas'),
  status = document.querySelector('#save-status');
let loading = false;
let engine,
  connected = false,
  ready = false,
  paused = false,
  received = -1,
  sequence = 0,
  previous = new Set(),
  revision = null,
  lastSave = '',
  pending = false,
  blocked = false,
  digit = 1,
  alternate = false;
const send = (type, payload) => {
  if (shell && nonce)
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
};
const saves = createSaveClient(send);

async function start() {
  if (!engine || !connected || ready || loading) return;
  loading = true;
  try {
    const record = await saves.service.read('progress');
    if (record) {
      const value = JSON.parse(new TextDecoder().decode(record.bytes));
      if (record.schemaVersion !== 1 || !validateSave(value, config))
        throw Error('Invalid save');
      engine.load(value.data);
      revision = record.revision;
    }
    lastSave = engine.save();
    status.textContent = 'Guest progress saved on this device.';
  } catch {
    blocked = true;
    status.textContent = 'Saving unavailable. Existing progress is preserved.';
  }
  ready = true;
  loading = false;
  send('playable', { sdkVersion: '0.1.0' });
  canvas.focus();
}
async function save() {
  if (!ready || !connected || blocked || pending) return;
  const data = engine.save();
  if (data === lastSave) return;
  pending = true;
  try {
    const result = await saves.service.write(
      'progress',
      {
        schemaVersion: 1,
        bytes: new TextEncoder().encode(
          JSON.stringify({ schemaVersion: 1, engine: config.engine, data }),
        ),
      },
      revision,
    );
    revision = result.revision;
    lastSave = data;
  } catch {
    blocked = true;
    status.textContent = 'Saving unavailable. Existing progress is preserved.';
  } finally {
    pending = false;
  }
}
function setDigit(change) {
  const max =
    config.engine === 'unequal' ? 4 : config.engine === 'towers' ? 5 : 9;
  digit = ((digit - 1 + change + max) % max) + 1;
  document.querySelector('#digit').textContent = `Digit: ${digit}`;
}
function action(name) {
  if (!engine || paused || (!ready && shell)) return;
  if (config.engine === 'loopy' && pointerAction(name)) return;
  if (name === 'digitNext') return setDigit(1);
  if (name === 'digitPrevious') return setDigit(-1);
  if (name === 'undo') return engine.command(7);
  if (name === 'redo') return engine.command(8);
  const key =
    {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      confirm: config.numeric ? String(digit) : 'Enter',
      cancel: config.numeric ? 'Backspace' : ' ',
      secondary: config.numeric ? 'Backspace' : ' ',
    }[name] || name;
  engine.key(key);
  canvas.focus();
}
addEventListener('message', (event) => {
  const message = event.data;
  if (
    event.source !== parent ||
    event.origin !== shell ||
    message?.protocol !== 'akeru.catalog.v1' ||
    message.nonce !== nonce ||
    !Number.isSafeInteger(message.sequence) ||
    message.sequence <= received
  )
    return;
  received = message.sequence;
  if (message.type === 'save-result') return saves.receive(message.payload);
  if (
    message.type === 'connect' &&
    !connected &&
    message.payload?.sdkVersion === '0.1.0'
  ) {
    connected = true;
    void start();
  } else if (message.type === 'pause' && connected) {
    paused = true;
    previous.clear();
    engine?.pause(true);
    document.body.classList.add('paused');
    void save();
  } else if (message.type === 'resume' && connected) {
    paused = false;
    previous.clear();
    engine?.pause(false);
    document.body.classList.remove('paused');
    canvas.focus();
  } else if (message.type === 'input' && connected && !paused) {
    const { buttons = {}, axes = {} } = message.payload || {},
      next = new Set(
        Object.entries(buttons)
          .filter(([, v]) => Number.isFinite(v) && v > 0.5)
          .map(([k]) => k),
      );
    for (const [axis, negative, positive] of [
      ['moveX', 'left', 'right'],
      ['moveY', 'up', 'down'],
      ['lookX', 'digitPrevious', 'digitNext'],
      ['lookY', 'undo', 'redo'],
    ]) {
      if (axes[axis] < -0.4) next.add(negative);
      if (axes[axis] > 0.4) next.add(positive);
    }
    if (config.engine === 'inertia') {
      for (const [a, b, key] of [
        ['up', 'left', 'Home'],
        ['up', 'right', 'PageUp'],
        ['down', 'left', 'End'],
        ['down', 'right', 'PageDown'],
      ])
        if (next.has(a) && next.has(b)) {
          next.delete(a);
          next.delete(b);
          next.add(key);
        }
    }
    for (const name of next) if (!previous.has(name)) action(name);
    previous = next;
  }
});
function engineReady() {
  engine = window.tathamEngine;
  engine.pause(paused);
  document.querySelector('#digit').hidden = !config.numeric;
  document.querySelector('#diagonals').hidden = config.engine !== 'inertia';
  if (!shell) {
    ready = true;
    status.textContent = 'Local evaluation · progress lasts for this session.';
  }
  void start();
  canvas.focus();
}
addEventListener('tatham-ready', engineReady);
if (window.tathamEngine?.ready) engineReady();
for (const button of document.querySelectorAll('[data-key]'))
  button.addEventListener('click', () => action(button.dataset.key));
for (const button of document.querySelectorAll('[data-action]'))
  button.addEventListener('click', () => action(button.dataset.action));
for (const button of document.querySelectorAll('[data-command]'))
  button.addEventListener('click', () => {
    if (engine && !paused) {
      engine.command(Number(button.dataset.command));
      canvas.focus();
    }
  });
document.querySelector('#digit').addEventListener('click', () => setDigit(1));
document.querySelector('#touch-mode').addEventListener('click', (event) => {
  alternate = !alternate;
  event.currentTarget.textContent = alternate
    ? 'Touch: alternate'
    : 'Touch: select';
});
const help = document.querySelector('#help');
document
  .querySelector('#help-toggle')
  .addEventListener('click', () => help.showModal());
document.querySelector('#help-close').addEventListener('click', () => {
  help.close();
  canvas.focus();
});
// Upstream handles mouse and keyboard. Pointer events add genuine touch drag/right-click.
let touching = false,
  touchButton = 0;
function pointer(event, kind) {
  if (event.pointerType === 'mouse') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!engine || paused) return;
  const rect = canvas.getBoundingClientRect(),
    x = Math.round(((event.clientX - rect.left) * canvas.width) / rect.width),
    y = Math.round(((event.clientY - rect.top) * canvas.height) / rect.height);
  if (kind === 'mousedown') {
    touching = true;
    touchButton = alternate ? 2 : 0;
    canvas.setPointerCapture(event.pointerId);
  }
  if (touching)
    engine.pointer(
      kind,
      x,
      y,
      kind === 'mousemove' ? 1 << touchButton : touchButton,
    );
  if (kind === 'mouseup') touching = false;
}
canvas.addEventListener(
  'pointerdown',
  (event) => pointer(event, 'mousedown'),
  true,
);
canvas.addEventListener(
  'pointermove',
  (event) => pointer(event, 'mousemove'),
  true,
);
canvas.addEventListener(
  'pointerup',
  (event) => pointer(event, 'mouseup'),
  true,
);
canvas.addEventListener(
  'pointercancel',
  (event) => pointer(event, 'mouseup'),
  true,
);
for (const type of [
  'click',
  'keydown',
  'mousedown',
  'mouseup',
  'mousemove',
  'pointerdown',
])
  document.addEventListener(
    type,
    (event) => {
      if (paused || (shell && !ready)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
setInterval(() => void save(), 1000);

// Loopy's upstream engine is mouse-only. A visible controller pointer invokes
// the original mouse API; it does not reimplement edge selection or rules.
let cursorX = 0.5,
  cursorY = 5 / 11;
const cursor = document.createElement('span');
cursor.id = 'controller-pointer';
cursor.hidden = true;
document.querySelector('#puzzlecanvascontain').append(cursor);
function positionCursor() {
  const board = canvas.getBoundingClientRect(),
    parent = canvas.parentElement.getBoundingClientRect();
  cursor.style.left = `${board.left - parent.left + cursorX * board.width}px`;
  cursor.style.top = `${board.top - parent.top + cursorY * board.height}px`;
}
function pointerAction(name) {
  const movement = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[name];
  if (movement) {
    cursorX = Math.max(1 / 22, Math.min(21 / 22, cursorX + movement[0] / 22));
    cursorY = Math.max(1 / 22, Math.min(21 / 22, cursorY + movement[1] / 22));
  } else if (['confirm', 'secondary', 'cancel', 'Enter', ' '].includes(name)) {
    const button = ['secondary', 'cancel', ' '].includes(name) ? 2 : 0;
    engine.pointer(
      'mousedown',
      Math.round(cursorX * canvas.width),
      Math.round(cursorY * canvas.height),
      button,
    );
    engine.pointer(
      'mouseup',
      Math.round(cursorX * canvas.width),
      Math.round(cursorY * canvas.height),
      button,
    );
  } else return false;
  cursor.hidden = false;
  positionCursor();
  return true;
}
new ResizeObserver(positionCursor).observe(canvas);
canvas.addEventListener(
  'keydown',
  (event) => {
    if (
      config.engine === 'loopy' &&
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Enter',
        ' ',
      ].includes(event.key)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      action(event.key);
    }
  },
  true,
);
