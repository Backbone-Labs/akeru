import { DEFAULT_MAPPINGS, validateMapping } from './normalize.js';

const titlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clone = value => structuredClone(value);

export function preferenceKey(titleId) {
  if (typeof titleId !== 'string' || titleId.length > 64 || !titlePattern.test(titleId)) throw new TypeError('Invalid title id');
  return `akeru:input:v1:${titleId}`;
}

export function defaultPreferences() {
  return { version: 1, deadzone: 0.15, selectedController: null, mappings: clone(DEFAULT_MAPPINGS) };
}

export function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['version', 'deadzone', 'selectedController', 'mappings'].includes(key)) || value.version !== 1 || !Number.isFinite(value.deadzone) || value.deadzone < 0 || value.deadzone > 0.5 || (value.selectedController !== null && (!Number.isSafeInteger(value.selectedController) || value.selectedController < 0 || value.selectedController > 15)) || !value.mappings || Object.keys(value.mappings).some(key => !['gamepad', 'touch'].includes(key))) throw new TypeError('Invalid input preferences');
  return {
    version: 1,
    deadzone: value.deadzone,
    selectedController: value.selectedController,
    mappings: {
      gamepad: validateMapping('gamepad', value.mappings.gamepad),
      touch: validateMapping('touch', value.mappings.touch),
    },
  };
}

export function loadPreferences(storage, titleId) {
  const fallback = defaultPreferences();
  if (!storage || typeof storage.getItem !== 'function') return fallback;
  try {
    const encoded = storage.getItem(preferenceKey(titleId));
    return encoded === null ? fallback : validatePreferences(JSON.parse(encoded));
  } catch {
    return fallback;
  }
}

export function savePreferences(storage, titleId, preferences) {
  const checked = validatePreferences(preferences);
  if (!storage || typeof storage.setItem !== 'function') return checked;
  try { storage.setItem(preferenceKey(titleId), JSON.stringify(checked)); } catch { /* Input remains usable when storage is unavailable. */ }
  return checked;
}
