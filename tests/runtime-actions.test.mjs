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
