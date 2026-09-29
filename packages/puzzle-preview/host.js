import { createSaveClient } from './save-client.js';
export function connectGame(game) {
  const p = new URLSearchParams(location.hash.slice(1)),
    nonce = p.get('nonce'),
    shell = p.get('shell');
  let received = -1,
    sequence = 0,
    connected = false,
    ready = false,
    saveBlocked = false,
    paused = false,
    previous = new Set(),
    revision = null,
    pending = false,
    dirty = false;
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
  const failure = () => {
    saveBlocked = true;
    document.querySelector('#save-status').textContent =
      'Saving unavailable. Existing progress is preserved.';
  };
  const save = async () => {
    if (!dirty || pending || !ready || saveBlocked) return;
    pending = true;
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
      failure();
    } finally {
      pending = false;
    }
  };
  const action = (a) => {
    if (ready && !paused) {
      game.action(a);
      dirty = true;
    }
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
    if (m.type === 'save-result') return saves.receive(m.payload);
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
          if (r.schemaVersion !== 1) throw new Error('Unsupported save');
          const candidate = JSON.parse(new TextDecoder().decode(r.bytes));
          if (!game.validate(candidate)) throw new Error('Invalid save');
          state = candidate;
          revision = r.revision;
        }
      } catch {
        failure();
      }
      game.start(state);
      ready = true;
      send('playable', { sdkVersion: '0.1.0' });
    } else if (m.type === 'input' && connected && !paused) {
      const { buttons = {}, axes = {} } = m.payload || {},
        next = new Set(
          Object.entries(buttons)
            .filter(([, v]) => Number.isFinite(v) && v > 0.5)
            .map(([k]) => k),
        );
      if (axes.moveX < -0.3) next.add('left');
      if (axes.moveX > 0.3) next.add('right');
      if (axes.moveY < -0.3) next.add('up');
      if (axes.moveY > 0.3) next.add('down');
      for (const a of next) if (!previous.has(a)) action(a);
      previous = next;
    } else if (m.type === 'pause') {
      paused = true;
      previous.clear();
      game.pause?.(true);
      void save();
    } else if (m.type === 'resume') {
      paused = false;
      previous.clear();
      game.pause?.(false);
    }
  });
  addEventListener('keydown', (e) => {
    const a = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      Enter: 'confirm',
      Space: 'confirm',
      KeyR: 'restart',
    }[e.code];
    if (a) {
      e.preventDefault();
      action(a);
    }
  });
  document
    .querySelectorAll('[data-action]')
    .forEach((b) =>
      b.addEventListener('click', () => action(b.dataset.action)),
    );
  setInterval(() => {
    if (game.dirty?.()) dirty = true;
    void save();
  }, 750);
  return action;
}
