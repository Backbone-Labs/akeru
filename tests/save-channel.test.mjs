import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
import { createSaveChannel } from '../platform/catalog/save-channel.js';
import { createSaveClient } from '../packages/contracts/src/save-client.js';
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('save messages are title-bound, authenticated, sequenced and reject injected identity', async () => {
  const sent = [];
  const frame = { postMessage: (m) => sent.push(m) };
  let writes = 0;
  const channel = createRuntimeChannel({
    frame,
    origin: 'https://title.example',
    nonce: 'a'.repeat(32),
    saveService: {
      write: async () => {
        writes++;
        return { revision: 'one' };
      },
    },
  });
  const data = {
    protocol: 'akeru.catalog.v1',
    nonce: 'a'.repeat(32),
    sequence: 0,
    type: 'save',
    payload: {
      requestId: 1,
      op: 'write',
      slot: 'main',
      expectedRevision: null,
      value: { schemaVersion: 1, bytes: new Uint8Array([1]) },
    },
  };
  const message = { source: frame, origin: 'https://title.example', data };
  assert.equal(
    channel.receive({ ...message, origin: 'https://other.example' }),
    false,
  );
  assert.equal(channel.receive({ ...message, source: {} }), false);
  assert.equal(
    channel.receive({
      ...message,
      data: { ...data, payload: { ...data.payload, titleId: 'victim' } },
    }),
    false,
  );
  assert.equal(channel.receive(message), true);
  assert.equal(channel.receive(message), false);
  await flush();
  assert.equal(writes, 1);
  assert.equal(sent[0].type, 'save-result');
  assert.equal(sent[0].payload.ok, true);
  channel.dispose();
});
test('save bridge bounds bytes/inflight and redacts internal errors', async () => {
  const sent = [];
  let finish;
  const service = {
    read: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  const channel = createSaveChannel(service, (type, p) => sent.push(p));
  assert.equal(
    channel.receive({
      requestId: 0,
      op: 'write',
      slot: 'a',
      expectedRevision: null,
      value: { schemaVersion: 1, bytes: new Uint8Array(1048577) },
    }),
    false,
  );
  for (let i = 0; i < 4; i++)
    assert.equal(
      channel.receive({ requestId: i, op: 'read', slot: 'a' }),
      true,
    );
  assert.equal(channel.receive({ requestId: 5, op: 'read', slot: 'a' }), false);
  await flush();
  channel.dispose();
  finish(null);
  await flush();
  assert.deepEqual(sent, []);
  const failure = createSaveChannel(
    {
      read: async () => {
        throw new Error('private-token');
      },
    },
    (type, p) => sent.push(p),
  );
  failure.receive({ requestId: 8, op: 'read', slot: 'a' });
  await flush();
  assert.deepEqual(sent, [{ requestId: 8, ok: false, code: 'unavailable' }]);
  failure.dispose();
});
test('save client pairs responses and cancels pending work on dispose', async () => {
  const sent = [];
  const client = createSaveClient((type, p) => sent.push(p));
  const request = client.service.read('main');
  assert.equal(
    client.receive({ requestId: 99, ok: true, result: null }),
    false,
  );
  assert.equal(
    client.receive({ requestId: sent[0].requestId, ok: true, result: null }),
    true,
  );
  assert.equal(await request, null);
  const pending = client.service.status();
  client.dispose();
  await assert.rejects(pending, { code: 'unavailable' });
});
