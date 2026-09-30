export const idle = {
  mx: 0,
  mz: 0,
  jump: false,
  fire: false,
  throw: false,
  grab: false,
  lookSpeed: 0,
};
export function input(keyboard, { buttons: b = {}, axes: a = {} }, game) {
  let mx = a.moveX || (b.right || 0) - (b.left || 0) || keyboard.mx;
  let mz = -(a.moveY || (b.down || 0) - (b.up || 0)) || keyboard.mz;
  const length = Math.hypot(mx, mz);
  if (length > 1) {
    mx /= length;
    mz /= length;
  }
  const old = game.akeruActions ?? {};
  const next = {
    grab: b.west > 0.5,
    throw: b.leftTrigger > 0.5 || b.north > 0.5,
  };
  game.akeruActions = next;
  const pending = game.akeruPending ?? {};
  game.akeruPending = {};
  return {
    ...keyboard,
    mx,
    mz,
    jump: keyboard.jump || b.confirm > 0.5 || Boolean(pending.jump),
    fire: keyboard.fire || b.rightTrigger > 0.5 || Boolean(pending.fire),
    grab: keyboard.grab || (next.grab && !old.grab) || Boolean(pending.grab),
    throw:
      keyboard.throw || (next.throw && !old.throw) || Boolean(pending.throw),
  };
}
export function look(mouse, { axes = {} }, dt) {
  // Pixel-equivalent deltas feed the original sensitivity, inversion and time model.
  const seconds = Math.max(0, Math.min(0.05, dt));
  const curve = (x) => Math.sign(x || 0) * Math.pow(Math.abs(x || 0), 1.5);
  return {
    dx: mouse.dx + curve(axes.lookX) * seconds * 1000,
    dy: mouse.dy + curve(axes.lookY) * seconds * 1000,
  };
}
