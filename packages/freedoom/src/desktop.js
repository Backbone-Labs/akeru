/** Title-owned desktop input. No browser or host privileges are required. */
const keys = {
  KeyW: 4,
  ArrowUp: 4,
  KeyS: 5,
  ArrowDown: 5,
  KeyA: 10,
  KeyD: 11,
  ArrowLeft: 6,
  ArrowRight: 7,
  Enter: 9,
  ControlLeft: 9,
  ControlRight: 9,
  Space: 8,
  KeyE: 8,
  KeyQ: 12,
  KeyR: 13,
  KeyM: 3,
  Escape: 3,
  Tab: 2,
  ShiftLeft: 1,
  ShiftRight: 1,
};
export function createDesktopInput() {
  const held = new Set();
  const taps = new Map();
  let firing = false,
    pulseUntil = 0,
    x = 0,
    y = 0;
  return {
    key(code, pressed, at = 0) {
      if (!Object.hasOwn(keys, code)) return false;
      if (pressed) {
        if (!held.has(code)) taps.set(code, at + 80);
        held.add(code);
      } else held.delete(code);
      return true;
    },
    fire(pressed) {
      firing = pressed;
    },
    confirm(at) {
      pulseUntil = at + 120;
    },
    move(dx, dy) {
      if (Number.isFinite(dx)) x = Math.max(-2048, Math.min(2048, x + dx));
      if (Number.isFinite(dy)) y = Math.max(-2048, Math.min(2048, y + dy));
    },
    read(at) {
      let mask = firing || at < pulseUntil ? 1 << 9 : 0;
      for (const code of held) mask |= 1 << keys[code];
      // Native keydown/up can both arrive before a rendered or simulation frame.
      for (const [code, until] of taps) {
        if (at < until) mask |= 1 << keys[code];
        else taps.delete(code);
      }
      const result = { mask, x: Math.round(x), y: Math.round(y) };
      x = y = 0;
      return result;
    },
    release() {
      held.clear();
      taps.clear();
      firing = false;
      pulseUntil = x = y = 0;
    },
  };
}
