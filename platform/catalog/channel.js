/** One authenticated, bounded channel per already-authorized isolated frame. */
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const control = (v, min) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length <= 32 &&
  Object.entries(v).every(
    ([k, n]) =>
      /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k) &&
      Number.isFinite(n) &&
      n >= min &&
      n <= 1,
  );
export function createRuntimeChannel({
  frame,
  origin,
  nonce,
  onEvent = () => {},
  now = () => performance.now(),
  timeoutMs = 15000,
}) {
  if (
    !frame ||
    typeof frame.postMessage !== 'function' ||
    !/^[-a-zA-Z0-9]{32,128}$/.test(nonce) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 60000
  )
    throw new Error('Invalid runtime channel');
  if (new URL(origin).origin !== origin)
    throw new Error('Invalid runtime origin');
  let state = 'loading',
    received = -1,
    sent = 0,
    lastInput = -1,
    lastTime = -1,
    closed = false,
    budgetAt = now(),
    budget = 0,
    connected = false;
  const send = (type, payload) => {
    if (!closed)
      frame.postMessage(
        {
          protocol: 'akeru.catalog.v1',
          nonce,
          sequence: sent++,
          type,
          payload,
        },
        origin,
      );
  };
  const timeout = setTimeout(() => {
    if (state === 'loading' && !closed) {
      state = 'error';
      onEvent({ type: 'error', code: 'timeout' });
      dispose();
    }
  }, timeoutMs);
  function dispose() {
    if (closed) return;
    clearTimeout(timeout);
    closed = true;
    state = 'closed';
  }
  function receive(event) {
    if (closed || event.source !== frame || event.origin !== origin)
      return false;
    const v = event.data;
    if (
      !exact(v, ['protocol', 'nonce', 'sequence', 'type', 'payload']) ||
      v.protocol !== 'akeru.catalog.v1' ||
      v.nonce !== nonce ||
      !Number.isSafeInteger(v.sequence) ||
      v.sequence <= received
    )
      return false;
    const at = now();
    if (at - budgetAt >= 1000) {
      budgetAt = at;
      budget = 0;
    }
    if (++budget > 60) return false;
    const p = v.payload;
    if (v.type === 'loading') {
      if (
        state !== 'loading' ||
        !exact(p, ['progress']) ||
        !Number.isFinite(p.progress) ||
        p.progress < 0 ||
        p.progress > 1
      )
        return false;
    } else if (v.type === 'playable') {
      if (
        state !== 'loading' ||
        !exact(p, ['sdkVersion']) ||
        p.sdkVersion !== '0.1.0'
      )
        return false;
      state = 'playable';
      clearTimeout(timeout);
    } else if (v.type === 'error') {
      if (
        !['loading', 'playable', 'paused'].includes(state) ||
        !exact(p, ['code']) ||
        !['initialization', 'unsupported', 'fatal'].includes(p.code)
      )
        return false;
      state = 'error';
      clearTimeout(timeout);
    } else if (v.type === 'exit') {
      if (!['loading', 'playable', 'paused'].includes(state) || !exact(p, []))
        return false;
    } else return false;
    received = v.sequence;
    onEvent({
      type: v.type,
      ...(v.type === 'loading'
        ? { progress: p.progress }
        : v.type === 'error'
          ? { code: 'runtime' }
          : {}),
    });
    if (v.type === 'exit' || v.type === 'error') dispose();
    return true;
  }
  function sendInput(input) {
    if (closed || state !== 'playable') return false;
    if (
      !exact(input, [
        'sequence',
        'timeMs',
        'provider',
        'connected',
        'buttons',
        'axes',
      ]) ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence <= lastInput ||
      !Number.isFinite(input.timeMs) ||
      input.timeMs < 0 ||
      input.timeMs < lastTime ||
      !['gamepad', 'touch', 'native-input'].includes(input.provider) ||
      typeof input.connected !== 'boolean' ||
      !control(input.buttons, 0) ||
      !control(input.axes, -1) ||
      (!input.connected &&
        [...Object.values(input.buttons), ...Object.values(input.axes)].some(
          (v) => v !== 0,
        ))
    )
      return false;
    lastInput = input.sequence;
    lastTime = input.timeMs;
    send('input', structuredClone(input));
    return true;
  }
  return Object.freeze({
    receive,
    sendInput,
    connect() {
      if (connected || closed) return;
      connected = true;
      send('connect', {
        sdkVersion: '0.1.0',
        saves: { local: 'unavailable', sync: 'disabled' },
      });
    },
    pause() {
      if (state !== 'playable' || closed) return false;
      state = 'paused';
      send('pause', {});
      return true;
    },
    resume() {
      if (state !== 'paused' || closed) return false;
      state = 'playable';
      send('resume', {});
      return true;
    },
    dispose,
    get state() {
      return state;
    },
  });
}
