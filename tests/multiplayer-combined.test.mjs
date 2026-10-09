import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Client } from '@colyseus/sdk';
import {
  KART_BUILD,
  ROOM_NAME as KART_ROOM,
} from '../packages/old-san-juan-kart/multiplayer/protocol.js';
import {
  BLACKLINE_BUILD,
  ROOM_NAME as BLACKLINE_ROOM,
} from '../packages/operation-blackline/multiplayer/protocol.js';
const built = ['kart-server/kart.js', 'blackline-server/match.js'].every(
  (path) => existsSync(new URL('../dist/' + path, import.meta.url)),
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await pause(25);
  }
  throw Error('Combined worker snapshot timed out');
}
test(
  'one worker isolates Kart and Blackline rooms, enforces build gates and shell origins',
  { skip: !built, timeout: 15000 },
  async () => {
    const { startMultiplayerServer } =
      await import('../packages/multiplayer/server.mjs');
    await assert.rejects(startMultiplayerServer(), /shell origins/);
    await assert.rejects(
      startMultiplayerServer({ origins: ['https://shell.test/path'] }),
      /exact HTTP/,
    );
    const worker = await startMultiplayerServer({
      origins: ['https://shell.test'],
    });
    const endpoint = `http://127.0.0.1:${worker.port}`,
      client = new Client(endpoint, {
        headers: { Origin: 'https://shell.test' },
      }),
      rooms = [];
    const capture = (room) => {
      rooms.push(room);
      room.onMessage('snapshot', (s) => (room.latest = s));
      return room;
    };
    try {
      assert.equal((await fetch(endpoint + '/health')).status, 200);
      await assert.rejects(
        new Client(endpoint).create(KART_ROOM, { build: KART_BUILD }),
      );
      const denied = await fetch(endpoint + '/matchmake/create/' + KART_ROOM, {
        method: 'POST',
        headers: {
          origin: 'https://evil.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ build: KART_BUILD }),
      });
      assert.equal(denied.status, 403);
      const preflight = await fetch(
        endpoint + '/matchmake/create/' + BLACKLINE_ROOM,
        { method: 'OPTIONS', headers: { origin: 'https://shell.test' } },
      );
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get('access-control-allow-origin'),
        'https://shell.test',
      );
      await assert.rejects(
        client.create(KART_ROOM, { build: BLACKLINE_BUILD }),
      );
      await assert.rejects(
        client.create(BLACKLINE_ROOM, { build: KART_BUILD }),
      );
      const kart = capture(
        await client.create(KART_ROOM, { build: KART_BUILD }),
      );
      const fps = capture(
        await client.create(BLACKLINE_ROOM, { build: BLACKLINE_BUILD }),
      );
      await assert.rejects(
        client.joinById(kart.roomId, { build: BLACKLINE_BUILD }),
      );
      await assert.rejects(client.joinById(fps.roomId, { build: KART_BUILD }));
      const kartGuest = capture(
        await client.joinById(kart.roomId, { build: KART_BUILD }),
      );
      const fpsGuest = capture(
        await client.joinById(fps.roomId, { build: BLACKLINE_BUILD }),
      );
      await until(
        () =>
          kart.latest?.players.length === 2 && fps.latest?.players.length === 2,
      );
      assert.equal(kart.latest.build, KART_BUILD);
      assert.equal(fps.latest.build, BLACKLINE_BUILD);
      assert.ok(!kart.latest.players.some((p) => p.id === fps.sessionId));
      assert.ok(!fps.latest.players.some((p) => p.id === kart.sessionId));
      for (const r of [kart, kartGuest])
        r.send('command', { action: 'ready', ready: true });
      await until(() => kart.latest.players.every((p) => p.ready));
      kart.send('command', { action: 'start' });
      await until(() => kart.latest.phase === 'countdown');
      assert.equal(fps.latest.phase, 'lobby');
      for (const r of [fps, fpsGuest])
        r.send('command', { action: 'ready', ready: true });
      await until(() => fps.latest.players.every((p) => p.ready));
      fps.send('command', { action: 'start' });
      await until(() => fps.latest.phase === 'countdown');
      assert.equal(fps.latest.packets.ps.length, 10);
      assert.equal(kart.latest.karts.length, 2);
    } finally {
      await Promise.allSettled(
        rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
      );
      await worker.close();
    }
  },
);
