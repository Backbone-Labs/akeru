// Host controls -> Slipface's logical input. Pure, so it is tested without the game.
//
// The host has already chosen the controller, applied its deadzone and mapped
// physical buttons to these logical names. The layout below is the one the
// game uses standalone, except that Menu belongs to Akeru: View opens the
// game's own pause menu instead.

const BUTTONS = [
  'confirm',
  'cancel',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'view',
  'up',
  'down',
  'left',
  'right',
];
const AXES = ['moveX', 'moveY'];
const TRIGGER = 0.3;
const PRESS = 0.5;
const MENU_STICK = 0.6;

/** What the game's How To Play shows for a controller, where Akeru's layout differs. */
export const help = { pause: 'VIEW' };

/**
 * Keep only the controls this title uses, as finite numbers in range.
 * Anything else in an input payload is dropped, never passed on.
 */
export function readControls(payload) {
  const pick = (record, names, min) => {
    const out = {};
    if (!record || typeof record !== 'object' || Array.isArray(record))
      return out;
    for (const name of names) {
      const value = Object.hasOwn(record, name) ? record[name] : 0;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const bounded = Math.max(min, Math.min(1, value));
      if (bounded !== 0) out[name] = bounded;
    }
    return out;
  };
  return {
    buttons: pick(payload?.buttons, BUTTONS, 0),
    axes: pick(payload?.axes, AXES, -1),
  };
}

/** True when anything is held or pushed. */
export function active(controls) {
  return (
    Object.values(controls.buttons).some((v) => v > PRESS) ||
    Object.values(controls.axes).some((v) => Math.abs(v) > PRESS)
  );
}

/**
 * @param controls from readControls()
 * @returns the game's logical input for this frame
 */
export function toInput(controls) {
  const b = controls.buttons;
  const a = controls.axes;
  const down = (name) => (b[name] ?? 0) > PRESS;
  const pulled = (name) => (b[name] ?? 0) > TRIGGER;
  const x = a.moveX ?? 0;
  const y = a.moveY ?? 0;
  return {
    steer: down('left') ? -1 : down('right') ? 1 : x,
    hop: down('confirm'),
    tuck: pulled('rightTrigger') || down('rightShoulder') || down('down'),
    brake:
      down('cancel') ||
      down('west') ||
      pulled('leftTrigger') ||
      down('leftShoulder') ||
      down('up'),
    pause: down('view'),
    confirm: down('confirm'),
    back: down('cancel'),
    up: down('up') || y < -MENU_STICK,
    down: down('down') || y > MENU_STICK,
    left: down('left') || x < -MENU_STICK,
    right: down('right') || x > MENU_STICK,
  };
}
