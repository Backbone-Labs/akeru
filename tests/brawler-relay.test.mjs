import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRelay } from '../packages/brawler-coop/server/relay.mjs';
async function setup(t, options = {}) {
  const relay = createRelay({ origins: ['https://title.example'], ...options });
  relay.server.listen(0, '127.0.0.1');
  await once(relay.server, 'listening');
  t.after(() => relay.close());
  const url = `ws://127.0.0.1:${relay.server.address().port}/relay`;
  return {
    relay,
    url,
    async client() {
      const ws = new WebSocket(url, { origin: 'https://title.example' });
      await once(ws, 'open');
      return ws;
    },
  };
}
const message = (ws) =>
  once(ws, 'message').then(([b]) => JSON.parse(b.toString()));
async function room(ws, body) {
  const next = message(ws);
  ws.send(JSON.stringify(body));
  return next;
}
test('Brawler rooms isolate packets, assign sender identity, enforce four players and host-only lock', async (t) => {
  const { client } = await setup(t),
    host = await client(),
    created = await room(host, { type: 'create' });
  assert.equal(created.id, 1);
  assert.match(created.code, /^[A-Z2-9]{6}$/);
  const guest = await client();
  assert.equal((await room(guest, { type: 'join', code: created.code })).id, 2);
  const other = await client();
  await room(other, { type: 'create' });
  let leaked = false;
  other.on('message', () => {
    leaked = true;
  });
  const packet = Buffer.alloc(13);
  packet.writeInt32LE(1, 0);
  packet.writeUInt32LE(2, 8);
  packet[12] = 99;
  const incoming = once(host, 'message');
  guest.send(packet);
  const [received, binary] = await incoming;
  assert.equal(binary, true);
  assert.equal(received.readInt32LE(0), 2);
  assert.equal(received[12], 99);
  assert.equal(leaked, false);
  for (let i = 3; i <= 4; i++) {
    const ws = await client();
    assert.equal((await room(ws, { type: 'join', code: created.code })).id, i);
  }
  const extra = await client();
  assert.match(
    (await room(extra, { type: 'join', code: created.code })).message,
    /full/,
  );
});
test('Brawler rejects missing rooms, malformed packets and untrusted origins', async (t) => {
  const { client, url } = await setup(t);
  const invalid = await client();
  assert.match(
    (await room(invalid, { type: 'join', code: 'AAAAAA' })).message,
    /not found/,
  );
  const ws = await client();
  await room(ws, { type: 'create' });
  const error = message(ws);
  ws.send(Buffer.alloc(4));
  assert.equal((await error).type, 'error');
  const blocked = new WebSocket(url, { origin: 'https://evil.example' });
  const [err] = await once(blocked, 'error');
  assert.match(err.message, /403/);
});
test('Brawler closes guests when host leaves and prevents joins after match lock', async (t) => {
  const { client } = await setup(t);
  const host = await client(),
    created = await room(host, { type: 'create' }),
    guest = await client();
  await room(guest, { type: 'join', code: created.code });
  host.send(JSON.stringify({ type: 'lock', locked: true }));
  await new Promise((r) => setTimeout(r, 15));
  const late = await client();
  assert.match(
    (await room(late, { type: 'join', code: created.code })).message,
    /started/,
  );
  const ended = message(guest);
  host.close();
  assert.equal((await ended).type, 'ended');
});

test('Brawler refuses guest lock and bounds room lifetime', async (t) => {
  const { client, relay } = await setup(t, { roomLifetimeMs: 20 });
  const host = await client(),
    created = await room(host, { type: 'create' });
  const guest = await client();
  await room(guest, { type: 'join', code: created.code });
  assert.equal(
    (await room(guest, { type: 'lock', locked: true })).type,
    'error',
  );
  const expired = await new Promise((resolve) =>
    host.on('message', (data) => {
      const value = JSON.parse(data.toString());
      if (value.type === 'ended') resolve(value);
    }),
  );
  assert.equal(expired.type, 'ended');
  assert.match(expired.message, /expired/);
  assert.equal(relay.rooms.size, 0);
});
