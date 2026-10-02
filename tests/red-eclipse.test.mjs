import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInput, trustedMessage } from '../packages/red-eclipse/src/input.js';

test('Red Eclipse touch and controller maps bound movement, aiming and actions', () => {
  assert.deepEqual(
    mapInput({
      axes: { moveX: 10, moveY: -3, lookX: NaN, lookY: Infinity },
      buttons: { confirm: 1, rightTrigger: 0.9, menu: 1 },
    }),
    {
      x: 1,
      y: -1,
      yaw: 0,
      pitch: 0,
      actions: [1, 0, 1, 0, 0, 0, 0, 0],
    },
  );
  assert.equal(mapInput({ buttons: { left: 1, up: 1 } }).x, -1);
  assert.deepEqual(mapInput(null).actions, Array(8).fill(0));
  assert.deepEqual(
    mapInput({ buttons: { rightTrigger: '1', confirm: true } }).actions,
    Array(8).fill(0),
  );
});
test('Red Eclipse accepts only authenticated ordered host messages', () => {
  const source = {},
    host = 'https://shell.example',
    nonce = 'session-nonce';
  const event = {
    source,
    origin: host,
    data: { protocol: 'akeru.catalog.v1', nonce, sequence: 2 },
  };
  assert.equal(trustedMessage(event, host, nonce, source, 1), true);
  for (const bad of [
    { ...event, source: {} },
    { ...event, origin: 'https://other.example' },
    { ...event, data: { ...event.data, nonce: 'wrong' } },
    { ...event, data: { ...event.data, sequence: 1 } },
    { ...event, data: { ...event.data, sequence: Infinity } },
    { ...event, data: { ...event.data, protocol: 'other' } },
  ])
    assert.equal(trustedMessage(bad, host, nonce, source, 1), false);
});
