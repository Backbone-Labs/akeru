import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  BLACKLINE_BUILD,
  ROOM_NAME,
  neutral,
  validInput,
  validRequest,
} from '../packages/operation-blackline/multiplayer/protocol.js';
const built = existsSync(
  new URL('../dist/blackline-server/match.js', import.meta.url),
);
const input = (seq, extra = {}) => ({ seq, ...neutral(), ...extra });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw Error('Condition timed out');
    await pause(20);
  }
}
test('Blackline inputs cannot set positions, health, identities, shot origins or arbitrary endpoints', () => {
  assert.equal(validInput(input(1)), true);
  for (const bad of [
    input(-1),
    input(1, { p: [0, 50, 0] }),
    input(1, { hp: 100 }),
    input(1, { id: 'victim' }),
    input(1, { yaw: Infinity }),
    input(1, { pitch: 2 }),
    input(1, { weapon: 3 }),
    input(1, { fire: 1 }),
    input(1, { moveX: 2 }),
    input(1, { o: [0, 0, 0] }),
  ])
    assert.equal(validInput(bad), false);
  assert.equal(
    validRequest({ action: 'create', endpoint: 'https://evil.test' }),
    false,
  );
  assert.equal(validRequest({ action: 'shoot', victim: 2 }), false);
  assert.equal(validRequest({ action: 'input', input: input(2) }), true);
});
test(
  'authoritative movement, collision, shooting, ammunition, death, respawn and full rounds',
  { skip: !built },
  async () => {
    const { BlacklineSimulation } =
      await import('../packages/operation-blackline/multiplayer/simulation.mjs');
    const roster = [
      { id: 'a', slot: 0, name: 'A' },
      { id: 'b', slot: 1, name: 'B' },
    ];
    const sim = new BlacklineSimulation(roster, {
      bots: false,
      countdown: 0,
      scoreLimit: 3,
    });
    const a = sim.controllers.get('a'),
      b = sim.controllers.get('b');
    const place = (c, x, z) => {
      c.entity.p = [x, 0, z];
      c.actor.pos.set(x, 0, z);
      c.actor.vel.set(0, 0, 0);
      c.entity.protUntil = 0;
    };
    place(a, 0, 52);
    place(b, 5, 52);
    // Actual server hitscan against an opposing player's head; no client damage command.
    for (let i = 0; i < 60 && b.entity.alive; i++)
      sim.step(new Map([['a', input(i, { yaw: -Math.PI / 2, fire: true })]]));
    assert.equal(b.entity.alive, false);
    assert.equal(a.entity.kills, 1);
    assert.equal(b.entity.deaths, 1);
    assert.deepEqual(sim.match.scores, [1, 0]);
    assert.ok(sim.events.some((e) => e.k === 'hit'));
    assert.ok(sim.events.some((e) => e.k === 'kill'));
    for (let i = 0; i < 310; i++) sim.step();
    assert.equal(b.entity.alive, true);
    assert.equal(b.entity.hp, 100);
    assert.ok(sim.events.some((e) => e.k === 'spawn' && e.i === b.entity.id));
    // Boundaries and map collision run in the server's pinned Player physics.
    place(a, 56, 52);
    for (let i = 0; i < 180; i++)
      sim.step(new Map([['a', input(i + 1000, { moveX: 1 })]]));
    assert.ok(a.entity.p[0] <= 56.62);
    place(a, 0, 52);
    place(b, 5, 52);
    b.entity.protUntil = Infinity;
    a.mag[0] = 2;
    for (let i = 0; i < 90; i++)
      sim.step(
        new Map([['a', input(i + 2000, { fire: true, yaw: -Math.PI / 2 })]]),
      );
    assert.equal(a.mag[0], 0);
    assert.equal(b.entity.hp, 100);
    for (let i = 0; i < 140; i++)
      sim.step(new Map([['a', input(i + 3000, { reload: true })]]));
    assert.equal(a.mag[0], 30);
    assert.equal(a.reserve[0], 90);
    // Two more real kills reach the shared score-limit result, followed by a fresh match.
    for (let kill = 0; kill < 2; kill++) {
      place(a, 0, 52);
      place(b, 5, 52);
      for (let i = 0; i < 90 && b.entity.alive; i++)
        sim.step(
          new Map([
            [
              'a',
              input(i + 4000 + kill * 1000, { fire: true, yaw: -Math.PI / 2 }),
            ],
          ]),
        );
      if (!sim.done) for (let i = 0; i < 310; i++) sim.step();
    }
    assert.equal(sim.done, true);
    assert.deepEqual(sim.match.scores, [3, 0]);
    assert.equal(sim.snapshot('a').phase, 'end');
    assert.ok(sim.events.some((e) => e.k === 'end' && e.winner === 0));
    const bots = new BlacklineSimulation(roster, {
      countdown: 0,
      timeLimit: 60000,
    });
    assert.equal(bots.snapshot('a').ps.length, 10);
    assert.equal(bots.snapshot('a').ps.filter((p) => p[1] === 0).length, 5);
    for (let i = 0; i < 3601 && !bots.done; i++) bots.step();
    assert.equal(bots.done, true);
    assert.ok(bots.events.some((e) => e.k === 'shot'));
    assert.equal(bots.snapshot('a').timeLeft, 0);
  },
);
test(
  'real Blackline sockets: private invites, ready, version gate, authority, isolation, reconnect and rematch',
  { skip: !built, timeout: 30000 },
  async () => {
    const { startBlacklineServer } =
      await import('../packages/operation-blackline/multiplayer/server.mjs');
    const worker = await startBlacklineServer({
      allowHeadless: true,
      origins: ['https://shell.test'],
    });
    const client = new Client(`http://127.0.0.1:${worker.port}`),
      rooms = [];
    const join = async (code) => {
      const room = code
        ? await client.joinById(code, { build: BLACKLINE_BUILD })
        : await client.create(ROOM_NAME, { build: BLACKLINE_BUILD });
      rooms.push(room);
      room.onMessage('snapshot', (s) => (room.latest = s));
      return room;
    };
    try {
      const denied = await fetch(
        `http://127.0.0.1:${worker.port}/matchmake/create/${ROOM_NAME}`,
        {
          method: 'POST',
          headers: {
            origin: 'https://evil.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ build: BLACKLINE_BUILD }),
        },
      );
      assert.equal(denied.status, 403);
      await assert.rejects(client.create(ROOM_NAME, { build: 'wrong' }));
      const a = await join(),
        b = await join(a.roomId),
        other = await join();
      await until(
        () =>
          a.latest?.players.length === 2 && other.latest?.players.length === 1,
      );
      b.send('command', { action: 'start' });
      await pause(100);
      assert.equal(a.latest.phase, 'lobby');
      for (const r of [a, b])
        r.send('command', { action: 'ready', ready: true });
      await until(() => a.latest.players.every((p) => p.ready));
      a.send('command', { action: 'start' });
      await until(() => a.latest.phase === 'playing');
      await assert.rejects(join(a.roomId));
      assert.equal(other.latest.phase, 'lobby');
      assert.equal(a.latest.packets.ps.length, 10);
      assert.notEqual(a.latest.packets.you.id, b.latest.packets.you.id);
      const before = [...a.latest.packets.you.p];
      for (let i = 1; i <= 12; i++) {
        a.send('command', { action: 'input', input: input(i, { moveX: 1 }) });
        await pause(35);
      }
      await until(() => a.latest.packets.you.ackSeq === 12);
      assert.ok(Math.abs(a.latest.packets.you.p[0] - before[0]) > 0.3);
      const local = matchMaker.getLocalRoomById(a.roomId);
      a.send('command', {
        action: 'input',
        input: input(999, { hp: 999, p: [999, 999, 999] }),
      });
      a.send('command', { action: 'input', input: input(1, { fire: true }) });
      await pause(100);
      assert.equal(local.players.get(a.sessionId).seq, 12);
      b.reconnection.minUptime = 0;
      b.reconnection.minDelay = 100;
      b.reconnection.delay = 100;
      let dropped = false,
        reconnected = false;
      b.onDrop(() => (dropped = true));
      b.onReconnect(() => (reconnected = true));
      const entityId = b.latest.packets.you.id;
      b.connection.close(4010);
      await until(
        () => dropped && reconnected && b.latest.packets?.you.id === entityId,
      );
      await pause(300);
      assert.ok(
        local.elapsed - local.players.get(a.sessionId).lastInput > 0.25,
      );
      // Server-owned clock reaches results; no protocol command can force a win.
      local.simulation.match.CFG.scoreLimit = 1;
      const { BlacklineSimulation } =
        await import('../packages/operation-blackline/multiplayer/simulation.mjs');
      local.simulation = new BlacklineSimulation([...local.players.values()], {
        countdown: 0,
        timeLimit: 50,
      });
      await until(() => a.latest.phase === 'results');
      b.send('command', { action: 'rematch' });
      await pause(100);
      assert.equal(a.latest.phase, 'results');
      a.send('command', { action: 'rematch' });
      await until(() => a.latest.phase === 'lobby');
      assert.ok(a.latest.players.every((p) => !p.ready));
      await a.leave();
      await until(() => b.latest.owner === b.sessionId);
    } finally {
      await Promise.allSettled(
        rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
      );
      await worker.close();
    }
  },
);
