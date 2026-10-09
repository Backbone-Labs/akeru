import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
test('runtime actions require advertised support, authenticated results, and dispose pending work', async () => {
  const sent = [];
  const frame = { postMessage: (m) => sent.push(m) };
  const origin = 'https://game.example';
  const nonce = 'a'.repeat(32);
  const channel = createRuntimeChannel({ frame, origin, nonce });
  let sequence = 0;
  const event = (type, payload) => ({
    source: frame,
    origin,
    data: {
      protocol: 'akeru.catalog.v1',
      nonce,
      sequence: sequence++,
      type,
      payload,
    },
  });
  channel.receive(event('playable', { sdkVersion: '0.1.0' }));
  await assert.rejects(channel.requestAction('save'));
  assert.equal(
    channel.receive(event('actions', { supported: ['delete-all'] })),
    false,
  );
  assert.equal(
    channel.receive(event('actions', { supported: ['save', 'restore'] })),
    true,
  );
  channel.pause();
  const result = channel.requestAction('save');
  const id = sent.at(-1).payload.id;
  await assert.rejects(channel.requestAction('restore'));
  assert.equal(
    channel.receive({
      ...event('action-result', { id, ok: true, message: 'Saved' }),
      origin: 'https://wrong.example',
    }),
    false,
  );
  assert.equal(
    channel.receive(
      event('action-result', { id: id + 1, ok: true, message: 'Saved' }),
    ),
    false,
  );
  assert.equal(
    channel.receive(event('action-result', { id, ok: true, message: 'Saved' })),
    true,
  );
  assert.deepEqual(await result, { ok: true, message: 'Saved' });
  const pending = channel.requestAction('restore');
  channel.dispose();
  await assert.rejects(pending, /closed/);
});

test('action state is typed, bounded and independent of display copy', async () => {
  const sent = [];
  const frame = { postMessage: (m) => sent.push(m) };
  const origin = 'https://game.example';
  const nonce = 'b'.repeat(32);
  const channel = createRuntimeChannel({ frame, origin, nonce });
  let sequence = 0;
  const event = (type, payload) => ({
    source: frame,
    origin,
    data: {
      protocol: 'akeru.catalog.v1',
      nonce,
      sequence: sequence++,
      type,
      payload,
    },
  });
  channel.receive(event('playable', { sdkVersion: '0.1.0' }));
  channel.receive(event('actions', { supported: ['save-status'] }));
  const pending = channel.requestAction('save-status');
  const id = sent.at(-1).payload.id;
  for (const state of [
    null,
    [],
    { hasManualSave: 'yes' },
    { audioState: 'unknown' },
    { savedAt: Infinity },
    { savedAt: -1 },
    { credentials: 'denied' },
  ]) {
    assert.equal(
      channel.receive(
        event('action-result', {
          id,
          ok: true,
          message: 'Translated copy',
          state,
        }),
      ),
      false,
    );
  }
  const state = { hasManualSave: true, savedAt: 1770000000000 };
  assert.equal(
    channel.receive(
      event('action-result', {
        id,
        ok: true,
        message: 'Translated copy',
        state,
      }),
    ),
    true,
  );
  assert.deepEqual(await pending, {
    ok: true,
    message: 'Translated copy',
    state,
  });
  channel.dispose();
});

test('touch overlay hint is authenticated, exact and unavailable before launch or after close', () => {
  const frame = { postMessage() {} },
    origin = 'https://game.example',
    nonce = 't'.repeat(32),
    events = [];
  const c = createRuntimeChannel({
    frame,
    origin,
    nonce,
    onEvent: (e) => events.push(e),
  });
  let sequence = 0;
  const event = (type, payload) => ({
    source: frame,
    origin,
    data: {
      protocol: 'akeru.catalog.v1',
      nonce,
      sequence: sequence++,
      type,
      payload,
    },
  });
  assert.equal(c.receive(event('touch-overlay', { visible: false })), false);
  c.receive(event('playable', { sdkVersion: '0.1.0' }));
  for (const payload of [
    {},
    { visible: 1 },
    { visible: false, selector: 'body' },
    null,
  ])
    assert.equal(c.receive(event('touch-overlay', payload)), false);
  assert.equal(
    c.receive({ ...event('touch-overlay', { visible: false }), source: {} }),
    false,
  );
  assert.equal(
    c.receive({
      ...event('touch-overlay', { visible: false }),
      origin: 'https://wrong.example',
    }),
    false,
  );
  const forged = event('touch-overlay', { visible: false });
  forged.data.nonce = 'x'.repeat(32);
  assert.equal(c.receive(forged), false);
  const valid = event('touch-overlay', { visible: false });
  assert.equal(c.receive(valid), true);
  assert.deepEqual(events.at(-1), { type: 'touch-overlay', visible: false });
  assert.equal(c.receive(valid), false);
  c.pause();
  assert.equal(c.receive(event('touch-overlay', { visible: true })), true);
  c.dispose();
  assert.equal(c.receive(event('touch-overlay', { visible: true })), false);
});
