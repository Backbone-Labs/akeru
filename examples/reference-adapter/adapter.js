/** Original conformance fixture: records normalized input; contains no third-party game. */
export function createAdapter() {
  let host, unsubscribe, disposed = false;
  const received = [];
  return {
    received,
    async initialize(services) {
      if (host || disposed) throw new Error('Already initialized or disposed');
      host = services;
      host.emit({ type: 'loading', progress: 0 });
      unsubscribe = host.onInput(input => received.push(input));
      await host.saves.read('progress');
      host.emit({ type: 'playable' });
    },
    async pause() { received.length = 0; host.emit({ type: 'paused' }); },
    async resume() { host.emit({ type: 'resumed' }); },
    async dispose() { if (disposed) return; disposed = true; unsubscribe?.(); received.length = 0; },
  };
}
