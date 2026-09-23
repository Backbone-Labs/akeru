/** Classic libretro pad bindings shared by host controller and touch. */
export function inputMask({ axes = {}, buttons = {} } = {}) {
  const down = (name) => Number.isFinite(buttons[name]) && buttons[name] > 0.5;
  const axis = (name) =>
    Number.isFinite(axes[name]) ? Math.max(-1, Math.min(1, axes[name])) : 0;
  let mask = 0;
  const key = (bit, active) => {
    if (active) mask |= 1 << bit;
  };
  key(4, down('up') || axis('moveY') < -0.3);
  key(5, down('down') || axis('moveY') > 0.3);
  key(6, down('left') || axis('lookX') < -0.3);
  key(7, down('right') || axis('lookX') > 0.3);
  key(10, down('leftShoulder') || axis('moveX') < -0.3);
  key(11, down('rightShoulder') || axis('moveX') > 0.3);
  key(9, down('confirm') || down('rightTrigger'));
  key(8, down('cancel') || down('west'));
  key(3, down('menu'));
  key(13, down('north'));
  key(2, down('view'));
  return mask;
}
