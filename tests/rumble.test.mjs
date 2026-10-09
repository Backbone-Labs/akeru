import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRumble } from '../platform/catalog/rumble.js';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
const effect = { duration: 200, strongMagnitude: 0.5, weakMagnitude: 0.2 };
test('rumble requires consent, bounds effects, limits rate and stops on disposal', async () => {
  let calls = 0,
    resets = 0,
    time = 0,
    visible = true;
  const r = createRumble({
    getGamepads: () => [
      {
        connected: true,
        vibrationActuator: {
          playEffect: async () => {
            calls++;
            return 'complete';
          },
          reset: () => {
            resets++;
          },
        },
      },
    ],
    visible: () => visible,
    now: () => time,
  });
  assert.equal(await r.play(effect), false);
  r.setEnabled(true);
  assert.equal(await r.play({ ...effect, duration: 501 }), false);
  assert.equal(await r.play({ ...effect, strongMagnitude: NaN }), false);
  assert.equal(await r.play(effect), true);
  assert.equal(await r.play(effect), false);
  time = 1000;
  visible = false;
  assert.equal(await r.play(effect), false);
  visible = true;
  r.setEnabled(false);
  assert.equal(resets, 1);
  r.dispose();
  r.setEnabled(true);
  assert.equal(await r.play(effect), false);
  assert.equal(calls, 1);
});
test('rumble handles unsupported hardware and actuator rejection', async () => {
  for (const getGamepads of [
    () => [],
    () => {
      throw Error();
    },
    () => [
      {
        connected: true,
        vibrationActuator: {
          playEffect: async () => {
            throw Error();
          },
        },
      },
    ],
  ]) {
    const r = createRumble({ getGamepads, visible: () => true });
    r.setEnabled(true);
    assert.equal(await r.play(effect), false);
  }
});
test('rumble messages are authenticated, bounded and rejected while paused or without host permission', () => {
  const frame = { postMessage() {} },
    origin = 'https://game.example',
    nonce = 'a'.repeat(32);
  let calls = 0,
    seq = 0;
  const channel = createRuntimeChannel({
    frame,
    origin,
    nonce,
    onRumble: () => calls++,
  });
  const msg = (type, payload, extra = {}) =>
    channel.receive({
      source: frame,
      origin,
      data: {
        protocol: 'akeru.catalog.v1',
        nonce,
        sequence: seq++,
        type,
        payload,
      },
      ...extra,
    });
  assert.equal(msg('rumble', effect), false);
  assert.equal(msg('playable', { sdkVersion: '0.1.0' }), true);
  assert.equal(
    msg('rumble', effect, { origin: 'https://evil.example' }),
    false,
  );
  assert.equal(msg('rumble', { ...effect, duration: 10000 }), false);
  assert.equal(msg('rumble', effect), true);
  channel.pause();
  assert.equal(msg('rumble', effect), false);
  channel.dispose();
  assert.equal(msg('rumble', effect), false);
  assert.equal(calls, 1);
  const denied = createRuntimeChannel({ frame, origin, nonce });
  denied.receive({
    source: frame,
    origin,
    data: {
      protocol: 'akeru.catalog.v1',
      nonce,
      sequence: 0,
      type: 'playable',
      payload: { sdkVersion: '0.1.0' },
    },
  });
  assert.equal(
    denied.receive({
      source: frame,
      origin,
      data: {
        protocol: 'akeru.catalog.v1',
        nonce,
        sequence: 1,
        type: 'rumble',
        payload: effect,
      },
    }),
    false,
  );
  denied.dispose();
});

test('native phone impacts remain opt-in, bounded, and disabled after disposal', async () => {
  const calls = [];
  const rumble = createRumble({
    getGamepads: () => [],
    visible: () => true,
    native: {
      postMessage: async (message) => {
        calls.push(message);
        return true;
      },
    },
  });
  await Promise.resolve();
  assert.equal(rumble.available, true);
  const effect = { duration: 90, strongMagnitude: 0.25, weakMagnitude: 0.5 };
  assert.equal(await rumble.play(effect), false);
  rumble.setEnabled(true);
  assert.equal(await rumble.play(effect), true);
  assert.deepEqual(calls.at(-1), { action: 'impact', intensity: 0.5 });
  assert.equal(await rumble.play(effect), false);
  rumble.dispose();
  assert.equal(await rumble.play(effect), false);
});
