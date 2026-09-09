export const GAMEPAD_BUTTONS = Object.freeze([
  'south', 'east', 'west', 'north', 'leftShoulder', 'rightShoulder',
  'leftTrigger', 'rightTrigger', 'select', 'start', 'leftStick',
  'rightStick', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'home',
]);
export const GAMEPAD_AXES = Object.freeze(['leftX', 'leftY', 'rightX', 'rightY']);
export const LOGICAL_BUTTONS = Object.freeze(['confirm', 'cancel', 'menu', 'up', 'down', 'left', 'right']);
export const LOGICAL_AXES = Object.freeze(['moveX', 'moveY', 'lookX', 'lookY']);

export const DEFAULT_MAPPINGS = Object.freeze({
  gamepad: Object.freeze({
    buttons: Object.freeze({ south: 'confirm', east: 'cancel', start: 'menu', dpadUp: 'up', dpadDown: 'down', dpadLeft: 'left', dpadRight: 'right' }),
    axes: Object.freeze({ leftX: 'moveX', leftY: 'moveY', rightX: 'lookX', rightY: 'lookY' }),
  }),
  touch: Object.freeze({
    buttons: Object.freeze({ south: 'confirm', east: 'cancel', start: 'menu', dpadUp: 'up', dpadDown: 'down', dpadLeft: 'left', dpadRight: 'right' }),
    axes: Object.freeze({}),
  }),
});

const namePattern = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const sources = { gamepad: { buttons: GAMEPAD_BUTTONS, axes: GAMEPAD_AXES }, touch: { buttons: GAMEPAD_BUTTONS, axes: [] } };

export function validateMapping(provider, mapping) {
  if (!sources[provider] || !mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !mapping.buttons || !mapping.axes) throw new TypeError('Invalid input mapping');
  if (Object.keys(mapping).some(key => !['buttons', 'axes'].includes(key))) throw new TypeError('Invalid input mapping');
  const result = { buttons: {}, axes: {} };
  for (const kind of ['buttons', 'axes']) {
    if (typeof mapping[kind] !== 'object' || Array.isArray(mapping[kind])) throw new TypeError('Invalid input mapping');
    const entries = Object.entries(mapping[kind]);
    if (entries.length > 32 || new Set(entries.map(([, target]) => target)).size !== entries.length) throw new TypeError('Ambiguous input mapping');
    for (const [source, target] of entries) {
      if (!namePattern.test(source) || !sources[provider][kind].includes(source) || !namePattern.test(target)) throw new TypeError('Unsupported input mapping');
      result[kind][source] = target;
    }
  }
  return result;
}

export function applyDeadzone(value, deadzone) {
  if (!Number.isFinite(value) || !Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) throw new TypeError('Invalid axis value or deadzone');
  const bounded = Math.max(-1, Math.min(1, value));
  if (Math.abs(bounded) <= deadzone) return 0;
  const normalized = Math.sign(bounded) * (Math.abs(bounded) - deadzone) / (1 - deadzone);
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function normalizeRawControls(raw, mapping, deadzone) {
  const buttons = {}, axes = {};
  for (const [source, target] of Object.entries(mapping.buttons)) {
    if (source in raw.buttons) buttons[target] = Math.max(0, Math.min(1, raw.buttons[source]));
  }
  for (const [source, target] of Object.entries(mapping.axes)) {
    if (source in raw.axes) axes[target] = applyDeadzone(raw.axes[source], deadzone);
  }
  return { buttons, axes };
}

export function readStandardGamepad(gamepad) {
  if (!gamepad || gamepad.connected === false || gamepad.mapping !== 'standard') return null;
  const buttons = {}, axes = {};
  for (let index = 0; index < GAMEPAD_BUTTONS.length; index++) {
    const button = gamepad.buttons?.[index];
    const value = typeof button === 'number' ? button : button?.value;
    buttons[GAMEPAD_BUTTONS[index]] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  for (let index = 0; index < GAMEPAD_AXES.length; index++) {
    const value = gamepad.axes?.[index];
    axes[GAMEPAD_AXES[index]] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }
  return { buttons, axes };
}

export function controlsNeutral(raw, { buttonThreshold = 0.05, axisThreshold = 0.05 } = {}) {
  return Object.values(raw.buttons).every(value => value <= buttonThreshold) && Object.values(raw.axes).every(value => Math.abs(value) <= axisThreshold);
}
