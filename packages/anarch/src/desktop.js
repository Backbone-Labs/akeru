/** Title-owned desktop input. No browser or host privileges are required. */
const keys = {
  KeyW: 0,
  ArrowUp: 0,
  KeyS: 2,
  ArrowDown: 2,
  KeyA: 8,
  KeyD: 9,
  ArrowLeft: 3,
  ArrowRight: 1,
  Enter: 4,
  ControlLeft: 4,
  ControlRight: 4,
  Space: 7,
  KeyQ: 13,
  KeyE: 12,
  KeyM: 14,
  Escape: 14,
  ShiftLeft: 5,
  ShiftRight: 5,
};
export function createDesktopInput() {
  const held = new Set();
  let firing = false,
    pulseUntil = 0,
    x = 0,
    y = 0;
  return {
    key(code, pressed) {
      if (!Object.hasOwn(keys, code)) return false;
      if (pressed) held.add(code);
      else held.delete(code);
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
      let mask = firing || at < pulseUntil ? 1 << 4 : 0;
      for (const code of held) mask |= 1 << keys[code];
      const result = { mask, x: Math.round(x), y: Math.round(y) };
      x = y = 0;
      return result;
    },
    release() {
      held.clear();
      firing = false;
      pulseUntil = x = y = 0;
    },
  };
}
