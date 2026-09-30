import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInput } from '../packages/brawler-coop/src/input.js';
test('Brawler maps analog movement, menu navigation and attack/jump', () => {
  const input = mapInput({
    axes: { moveX: -0.8, moveY: 0.6 },
    buttons: { confirm: 1, west: 1 },
  });
  assert.equal(input.move_left, 0.8);
  assert.equal(input.move_down, 0.6);
  assert.equal(input.ui_left, 1);
  assert.equal(input.ui_down, 1);
  assert.equal(input.jump, 1);
  assert.equal(input.ui_accept, 1);
  assert.equal(input.attack, 1);
});
test('Brawler clamps invalid input and disconnect releases every action', () => {
  const input = mapInput({
    axes: { moveX: Infinity, moveY: NaN },
    buttons: { confirm: '1', west: -1, rightTrigger: 3 },
  });
  assert.equal(input.jump, 0);
  assert.equal(input.attack, 1);
  assert.equal(input.move_left, 0);
  assert.ok(Object.values(mapInput(null)).every((value) => value === 0));
  assert.equal(mapInput({ buttons: { left: 1 } }).move_left, 1);
});
