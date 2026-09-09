import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAPPINGS, applyDeadzone, defaultPreferences, loadPreferences,
  normalizeRawControls, preferenceKey, readStandardGamepad, savePreferences,
  validateMapping, validatePreferences,
} from '@akeru/input';

test('standard gamepad values are bounded, mapped and deadzoned', () => {
  const pad = { connected: true, mapping: 'standard', buttons: [{ value: 2 }, { value: -1 }], axes: [0.1, -0.6, 2, -2] };
  const raw = readStandardGamepad(pad);
  assert.equal(raw.buttons.south, 1);
  assert.equal(raw.buttons.east, 0);
  assert.deepEqual([raw.axes.leftX, raw.axes.leftY, raw.axes.rightX, raw.axes.rightY], [0.1, -0.6, 1, -1]);
  const normalized = normalizeRawControls(raw, DEFAULT_MAPPINGS.gamepad, 0.2);
  assert.equal(normalized.axes.moveX, 0);
  assert.ok(Math.abs(normalized.axes.moveY + 0.5) < Number.EPSILON);
  assert.equal(applyDeadzone(-0.2, 0.2), 0);
});

test('mapping accepts title actions but rejects unsupported sources and ambiguity', () => {
  assert.deepEqual(validateMapping('gamepad', { buttons: { south: 'fire' }, axes: { leftX: 'steer' } }), { buttons: { south: 'fire' }, axes: { leftX: 'steer' } });
  assert.throws(() => validateMapping('gamepad', { buttons: { keyboardA: 'fire' }, axes: {} }), /Unsupported/);
  assert.throws(() => validateMapping('gamepad', { buttons: { south: 'fire', east: 'fire' }, axes: {} }), /Ambiguous/);
  assert.throws(() => validateMapping('touch', { buttons: {}, axes: { leftX: 'moveX' } }), /Unsupported/);
});

test('preferences are validated, isolated by title and fail closed to defaults', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const one = defaultPreferences(); one.deadzone = 0.25;
  savePreferences(storage, 'title-one', one);
  assert.equal(loadPreferences(storage, 'title-one').deadzone, 0.25);
  assert.equal(loadPreferences(storage, 'title-two').deadzone, 0.15);
  data.set(preferenceKey('title-one'), '{bad json');
  assert.equal(loadPreferences(storage, 'title-one').deadzone, 0.15);
  assert.throws(() => preferenceKey('../other-title'));
  assert.throws(() => validatePreferences({ ...defaultPreferences(), selectedController: 16 }));
});
