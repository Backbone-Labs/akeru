/** Map host-normalized controller/touch actions to Anarch's portable keys. */
export function inputMask({ axes = {}, buttons = {} } = {}) {
  const down = (name) => Number.isFinite(buttons[name]) && buttons[name] > 0.5;
  const axis = (name) =>
    Number.isFinite(axes[name]) ? Math.max(-1, Math.min(1, axes[name])) : 0;
  let mask = 0;
  const key = (bit, active) => {
    if (active) mask |= 1 << bit;
  };
  key(0, down('up') || axis('moveY') < -0.3);
  key(2, down('down') || axis('moveY') > 0.3);
  key(3, down('left') || axis('moveX') < -0.3 || axis('lookX') < -0.3);
  key(1, down('right') || axis('moveX') > 0.3 || axis('lookX') > 0.3);
  key(4, down('confirm') || down('rightTrigger'));
  key(5, down('cancel'));
  key(6, down('menu'));
  key(7, down('west'));
  key(8, down('leftShoulder'));
  key(9, down('rightShoulder'));
  key(12, down('north'));
  return mask;
}
