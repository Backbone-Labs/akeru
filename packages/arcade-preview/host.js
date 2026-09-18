import { createSaveClient } from './save-client.js';
/** Host-only persistence and authenticated input. No direct Gamepad/storage access. */
export function connectGame(game) {
  const args = new URLSearchParams(location.hash.slice(1));
  const nonce = args.get('nonce'),
    shell = args.get('shell');
  let received = -1,
    sequence = 0,
    connected = false,
    ready = false,
    paused = false;
  let revision = null,
    saving = false,
    blocked = false,
    dirty = false;
  const keys = new Set(),
    touches = new Map();
  let controller = new Set();
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
  const status = (text) => {
    document.querySelector('#save-status').textContent = text;
  };
  const save = async () => {
    if (!ready || blocked || saving || !dirty) return;
    saving = true;
    dirty = false;
    try {
      const r = await saves.service.write(
        'progress',
        {
          schemaVersion: 1,
          bytes: new TextEncoder().encode(JSON.stringify(game.serialize())),
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
  const held = () =>
    ready && !paused
      ? new Set([...keys, ...controller, ...touches.values()])
      : new Set();
  const action = (a) => {
    if (ready && !paused) {
      game.action?.(a);
      dirty = true;
    }
  };
  const clear = () => {
    keys.clear();
    touches.clear();
    controller.clear();
  };
  const setPause = (value) => {
    paused = value;
    clear();
    document.body.dataset.paused = String(value || document.hidden);
    game.pause?.(value || document.hidden);
    if (value) void save();
  };
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
    if (
      m.type === 'controller-status' &&
      typeof m.payload?.connected === 'boolean'
    ) {
      game.controllerChanged?.(m.payload.connected);
      return;
    }
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
      let state = null;
      try {
        const r = await saves.service.read('progress');
        if (r) {
          state = JSON.parse(new TextDecoder().decode(r.bytes));
          if (r.schemaVersion !== 1 || !game.validate(state))
            throw new Error('Invalid save');
          revision = r.revision;
        }
      } catch {
        state = null;
        blocked = true;
        status('Saving unavailable. Existing progress is preserved.');
      }
      try {
        await game.start(state);
        ready = true;
        document.body.dataset.ready = 'true';
        setPause(paused);
        send('playable', { sdkVersion: '0.1.0' });
      } catch {
        document.querySelector('#status').textContent =
          'This game could not start. Please exit and try again.';
        send('error', { code: 'initialization' });
      }
    } else if (m.type === 'input' && ready && !paused) {
      const { buttons = {}, axes = {} } = m.payload || {};
      const next = new Set(
        Object.entries(buttons)
          .filter(([, v]) => Number.isFinite(v) && v > 0.5)
          .map(([k]) => k),
      );
      if (axes.moveX < -0.3) next.add('left');
      if (axes.moveX > 0.3) next.add('right');
      if (axes.moveY < -0.3) next.add('up');
      if (axes.moveY > 0.3) next.add('down');
      for (const a of next) if (!controller.has(a)) action(a);
      controller = next;
    } else if (m.type === 'pause') setPause(true);
    else if (m.type === 'resume') setPause(false);
  });
  const bindings = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'confirm',
    Enter: 'confirm',
    Backspace: 'cancel',
    KeyR: 'restart',
  };
  addEventListener('keydown', (e) => {
    const a = bindings[e.code];
    if (a) {
      e.preventDefault();
      if (!keys.has(a)) action(a);
      keys.add(a);
    }
  });
  addEventListener('keyup', (e) => {
    const a = bindings[e.code];
    if (a) {
      e.preventDefault();
      keys.delete(a);
    }
  });
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => {
    setPause(paused);
  });
  document.querySelectorAll('[data-hold]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, button.dataset.hold);
      action(button.dataset.hold);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(event, (e) => touches.delete(e.pointerId));
  });
  document
    .querySelectorAll('[data-action]')
    .forEach((button) =>
      button.addEventListener('click', () => action(button.dataset.action)),
    );
  setInterval(() => {
    if (game.dirty?.()) dirty = true;
    void save();
  }, 750);
  return {
    held,
    action,
    rumble(effect) {
      if (ready && !paused && !document.hidden) send('rumble', effect);
    },
    changed() {
      dirty = true;
    },
    get active() {
      return ready && !paused && !document.hidden;
    },
  };
}
