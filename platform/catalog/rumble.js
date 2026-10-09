/** Shell-owned, opt-in, bounded haptics. Games never choose a device. */
export function createRumble({
  native = globalThis.webkit?.messageHandlers?.akeruPlayer,
  getGamepads = () => navigator.getGamepads?.() ?? [],
  visible = () => !document.hidden,
  now = () => performance.now(),
} = {}) {
  let enabled = false,
    disposed = false,
    last = -Infinity;
  let nativeAvailable = false;
  if (native?.postMessage) {
    Promise.resolve(native.postMessage({ action: 'available' })).then(
      (result) => {
        nativeAvailable = result === true;
      },
      () => {},
    );
  }
  const running = new Set();
  const actuator = () => {
    try {
      return Array.from(getGamepads()).find(
        (p) =>
          p?.connected && typeof p.vibrationActuator?.playEffect === 'function',
      )?.vibrationActuator;
    } catch {
      return null;
    }
  };
  const stop = () => {
    for (const a of running) {
      try {
        Promise.resolve(a.reset?.()).catch(() => {});
      } catch {
        /* Disconnected. */
      }
    }
    running.clear();
  };
  return {
    get available() {
      return !disposed && (!!actuator() || nativeAvailable);
    },
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = value === true && !disposed;
      if (!enabled) stop();
    },
    async play(effect) {
      if (
        disposed ||
        !enabled ||
        !visible() ||
        now() - last < 100 ||
        !effect ||
        Object.keys(effect).length !== 3 ||
        !Number.isFinite(effect.duration) ||
        effect.duration < 1 ||
        effect.duration > 500 ||
        !['strongMagnitude', 'weakMagnitude'].every(
          (k) => Number.isFinite(effect[k]) && effect[k] >= 0 && effect[k] <= 1,
        )
      )
        return false;
      const a = actuator();
      if (!a) {
        if (!nativeAvailable) return false;
        last = now();
        try {
          return (
            (await native.postMessage({
              action: 'impact',
              intensity: Math.max(effect.strongMagnitude, effect.weakMagnitude),
            })) === true
          );
        } catch {
          return false;
        }
      }
      last = now();
      running.add(a);
      try {
        return (
          (await a.playEffect('dual-rumble', { ...effect, startDelay: 0 })) ===
          'complete'
        );
      } catch {
        return false;
      }
    },
    stop,
    dispose() {
      stop();
      disposed = true;
      enabled = false;
    },
  };
}
