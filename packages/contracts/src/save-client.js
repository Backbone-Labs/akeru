/** Use only behind an authenticated runtime channel; receive accepts trusted host payloads. */
export function createSaveClient(send, { timeoutMs = 5000 } = {}) {
  if (
    typeof send !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000
  )
    throw new Error('Invalid save client');
  const pending = new Map();
  let sequence = 0,
    closed = false;
  const error = (code) => Object.assign(new Error(`Save ${code}`), { code });
  function request(op, args = {}) {
    if (closed || pending.size >= 4)
      return Promise.reject(error('unavailable'));
    const requestId = sequence++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(error('unavailable'));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try {
        send('save', { requestId, op, ...args });
      } catch {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error('unavailable'));
      }
    });
  }
  return Object.freeze({
    service: Object.freeze({
      read: (slot) => request('read', { slot }),
      write: (slot, value, expectedRevision) =>
        request('write', { slot, value, expectedRevision }),
      remove: (slot, expectedRevision) =>
        request('remove', { slot, expectedRevision }).then(() => undefined),
      status: () => request('status'),
    }),
    receive(payload) {
      const entry = pending.get(payload?.requestId);
      if (!entry || typeof payload.ok !== 'boolean') return false;
      clearTimeout(entry.timer);
      pending.delete(payload.requestId);
      if (payload.ok) entry.resolve(payload.result);
      else
        entry.reject(
          error(
            [
              'conflict',
              'invalid',
              'unavailable',
              'quota',
              'corrupt',
              'migration',
            ].includes(payload.code)
              ? payload.code
              : 'unavailable',
          ),
        );
      return true;
    },
    dispose() {
      closed = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error('unavailable'));
      }
      pending.clear();
    },
  });
}
