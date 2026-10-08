import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../packages/bubblekick/src/controller.js';
test('short native press and release survive between game frames', () => {
  const c = createController();
  c.update({ buttons: { confirm: 1 } });
  c.update({ buttons: { confirm: 0 } });
  assert.equal(c.read()[0].buttons[0].pressed, true);
  assert.equal(c.read()[0].buttons[0].pressed, false);
  assert.equal(c.read()[0].buttons[0].pressed, false);
});
test('holds do not repeat, axes and Backbone actions use standard mapping', () => {
  const c = createController();
  for (let i = 0; i < 50; i++)
    c.update({
      buttons: { confirm: 1, west: 1, north: 1, rightShoulder: 1 },
      axes: { moveX: 0.7, moveY: -0.8 },
    });
  const p = c.read()[0];
  assert.deepEqual(p.axes, [0.7, -0.8, 0, 0]);
  for (const i of [0, 2, 3, 5]) assert(p.buttons[i].pressed);
  c.update({});
  assert.equal(c.read()[0].buttons[0].pressed, false);
});
test('pause/disconnect drops pending presses and neutralizes movement; guide remains host-owned', () => {
  const c = createController();
  c.update({ buttons: { confirm: 1, guide: 1 }, axes: { moveX: 1 } });
  c.clear();
  const p = c.read()[0];
  assert(p.buttons.every((b) => !b.pressed));
  assert.deepEqual(p.axes, [0, 0, 0, 0]);
  c.update({ buttons: { cancel: 1 } });
  assert(c.read()[0].buttons[1].pressed);
});
