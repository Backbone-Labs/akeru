import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  Rooms,
  normalizeCode,
} = require('../packages/red-eclipse/server/rooms.cjs');
import { roomCode } from '../packages/red-eclipse/src/rooms.js';
test('room codes reject injection and normalize only complete invitations', () => {
  for (const code of [
    '../private',
    '',
    'A'.repeat(19),
    'A'.repeat(21),
    'G'.repeat(20),
    'a?token=b',
  ]) {
    assert.equal(normalizeCode(code), null);
    assert.equal(roomCode(code), null);
  }
  assert.equal(
    normalizeCode('abcd abcd abcd abcd abcd'),
    'ABCDABCDABCDABCDABCD',
  );
});
test('private rooms own distinct processes, ports and unguessable relay credentials', async () => {
  let stopped = 0;
  const rooms = new Rooms({ launch: async () => () => stopped++ });
  const a = await rooms.create(),
    b = await rooms.create();
  assert.notEqual(a.port, b.port);
  assert.notEqual(a.token, b.token);
  assert.equal(rooms.authorize(a.token), a);
  assert.equal(rooms.authorize(b.token), b);
  assert.equal(rooms.authorize(a.code), null);
  assert.equal(rooms.authorize('a'.repeat(48)), null);
  assert.throws(() => rooms.join('unknown'), /not found/);
  assert.equal(rooms.join(a.code), a);
  rooms.destroy(a);
  assert.equal(rooms.authorize(a.token), null);
  assert.equal(rooms.authorize(b.token), b);
  assert.equal(stopped, 1);
  rooms.close();
  assert.equal(stopped, 2);
});
test('room capacity, global bounds, expiry and startup failure cannot expose another match', async () => {
  let now = 0;
  const rooms = new Rooms({
    launch: async () => () => {},
    maximum: 2,
    idleMs: 100,
    now: () => now,
  });
  const a = await rooms.create(),
    b = await rooms.create();
  await assert.rejects(rooms.create(), /busy/);
  for (let i = 0; i < 8; i++) a.clients.add({ close() {} });
  assert.equal(rooms.authorize(a.token), null);
  assert.throws(() => rooms.join(a.code), /full/);
  now = 101;
  rooms.sweep();
  assert.equal(rooms.authorize(b.token), null);
  assert.equal(rooms.rooms.has(a.code), true);
  a.clients.clear();
  rooms.sweep();
  assert.equal(rooms.rooms.size, 0);
  const failing = new Rooms({
    launch: async () => {
      throw Error('native failed');
    },
  });
  await assert.rejects(failing.create(), /native failed/);
  assert.equal(failing.rooms.size, 0);
});

test('a closing native process keeps its port until it actually exits', async () => {
  const exits = new Map();
  const rooms = new Rooms({
    launch: async (room, onExit) => {
      exits.set(room.code, onExit);
      return () => {};
    },
  });
  const a = await rooms.create();
  rooms.destroy(a);
  const b = await rooms.create();
  assert.notEqual(a.port, b.port);
  exits.get(a.code)();
  const c = await rooms.create();
  assert.equal(c.port, a.port);
  assert.equal(rooms.authorize(b.token), b);
  rooms.close();
});
