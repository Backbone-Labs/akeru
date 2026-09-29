export const idle = {
  mx: 0,
  my: 0,
  interact: false,
  action: false,
  dash: false,
};
export function input(keyboard, { buttons: b = {}, axes: a = {} } = {}) {
  let mx = a.moveX || (b.right || 0) - (b.left || 0) || keyboard.mx,
    my = a.moveY || (b.down || 0) - (b.up || 0) || keyboard.my;
  const n = Math.hypot(mx, my);
  if (n > 1) {
    mx /= n;
    my /= n;
  }
  return {
    mx,
    my,
    interact: keyboard.interact || b.confirm > 0.5,
    action: keyboard.action || b.west > 0.5 || b.rightTrigger > 0.5,
    dash: keyboard.dash || b.cancel > 0.5,
  };
}
