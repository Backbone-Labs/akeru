import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createConsoleSound,
  directionalTarget,
} from '../platform/catalog/console-ui.js';

test('UI sounds honor mute, gesture gating, throttling and disposal', () => {
  let starts = 0,
    opens = 0,
    closes = 0;
  const storage = new Map();
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const context = {
    state: 'running',
    currentTime: 1,
    destination: {},
    createOscillator: () => ({
      frequency: param,
      connect() {},
      disconnect() {},
      start() {
        starts++;
      },
      stop() {},
    }),
    createGain: () => ({ gain: param, connect() {}, disconnect() {} }),
    close() {
      closes++;
      this.state = 'closed';
      return Promise.resolve();
    },
  };
  const sound = createConsoleSound(
    {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    () => {
      opens++;
      return context;
    },
  );
  sound.play();
  assert.equal(opens, 0);
  assert.equal(starts, 0);
  sound.unlock();
  sound.play();
  sound.play();
  assert.equal(starts, 1);
  context.currentTime += 0.2;
  sound.toggle();
  sound.play();
  assert.equal(starts, 1);
  assert.equal(storage.get('akeru.ui-sound'), 'off');
  sound.toggle();
  assert.equal(starts, 2);
  sound.dispose();
  context.currentTime += 0.2;
  sound.unlock();
  sound.play();
  assert.equal(opens, 1);
  assert.equal(closes, 1);
  assert.equal(starts, 2);
});

test('spatial focus favors the adjacent row over DOM order and stays at edges', () => {
  const target = (x, y, w, h, primary = false) => ({
    matches: () => primary,
    getBoundingClientRect: () => ({
      x,
      y,
      width: w,
      height: h,
      left: x,
      right: x + w,
      top: y,
      bottom: y + h,
    }),
  });
  const left = target(0, 100, 100, 50, true),
    right = target(130, 100, 100, 50),
    above = target(0, 0, 100, 30),
    distant = target(300, 200, 50, 50);
  const targets = [above, distant, left, right];
  assert.equal(directionalTarget(targets, null, 'down'), left);
  assert.equal(directionalTarget(targets, left, 'right'), right);
  assert.equal(directionalTarget(targets, left, 'up'), above);
  assert.equal(directionalTarget(targets, left, 'left'), left);
  assert.equal(directionalTarget([], left, 'left'), null);
});
