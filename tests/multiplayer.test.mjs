import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import {
  KART_BUILD,
  ROOM_NAME,
  validInput,
  validRequest,
} from '../packages/old-san-juan-kart/multiplayer/protocol.js';
import { CAPABILITY } from '../packages/multiplayer/src/protocol.js';
import { validateManifest } from '../packages/contracts/src/index.js';
import { planLaunch } from '../packages/contracts/src/reference-host.js';
import {
  createRuntimeChannel,
  createRuntimeNonce,
} from '../platform/catalog/channel.js';
const built = existsSync(
  new URL('../dist/kart-server/kart.js', import.meta.url),
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 7000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw Error('Condition timed out');
    await pause(20);
  }
}
const drive = (seq, extra = {}) => ({
  seq,
  throttle: 1,
  brake: 0,
  steer: 0,
  drift: false,
  ...extra,
});

test('network contract rejects arbitrary network access, game state and malformed inputs', () => {
  assert.equal(validInput(drive(1)), true);
  for (const input of [
    drive(-1),
    drive(1, { steer: NaN }),
    drive(1, { throttle: 2 }),
    drive(1, { x: 200 }),
    drive(1, { lap: 3 }),
    drive(1, { drift: 1 }),
  ])
    assert.equal(validInput(input), false);
  for (const request of [
    { action: 'join', code: 'x' },
    { action: 'create', endpoint: 'https://evil.test' },
    { action: 'input', input: drive(1, { id: 'other' }) },
    { action: 'publish' },
  ])
    assert.equal(validRequest(request), false);
  const manifest = JSON.parse(
    readFileSync(
      new URL('../examples/contract-fixture/akeru.json', import.meta.url),
    ),
  );
  manifest.capabilities.push(CAPABILITY);
  assert.equal(validateManifest(manifest).valid, true);
  const policy = {
    grants: ['save.local'],
    graphics: ['webgl2'],
    features: [],
    shellOrigin: 'https://shell.example.com',
    titleOrigin: 'https://title.example.net',
  };
  assert.throws(() => planLaunch(manifest, policy), /grant/);
  const plan = planLaunch(manifest, {
    ...policy,
    grants: ['save.local', CAPABILITY],
  });
  assert.ok(plan);
  manifest.multiplayerEndpoint = 'https://evil.test';
  assert.equal(validateManifest(manifest).valid, false);
});

test('room bridge is denied without host grant and rejects forged frames, replays and paused inputs', () => {
  const messages = [],
    frame = { postMessage: (m) => messages.push(m) },
    origin = 'https://title.example.net',
    nonce = 'a'.repeat(32);
  const msg = (seq, type, payload) => ({
    source: frame,
    origin,
    data: { protocol: 'akeru.catalog.v1', nonce, sequence: seq, type, payload },
  });
  const denied = createRuntimeChannel({ frame, origin, nonce });
  denied.receive(msg(0, 'playable', { sdkVersion: '0.1.0' }));
  assert.equal(
    denied.receive(msg(1, 'multiplayer', { action: 'create' })),
    false,
  );
  denied.dispose();
  let received = 0,
    disposed = 0;
  const granted = createRuntimeChannel({
    frame,
    origin,
    nonce,
    multiplayerService: {
      connect: (notify) => notify({ status: 'available' }),
      receive: (v) => {
        if (!validRequest(v)) return false;
        received++;
        return true;
      },
      dispose: () => disposed++,
    },
  });
  assert.equal(
    granted.receive(msg(0, 'playable', { sdkVersion: '0.1.0' })),
    true,
  );
  assert.equal(
    granted.receive({
      ...msg(1, 'multiplayer', { action: 'create' }),
      source: {},
    }),
    false,
  );
  assert.equal(
    granted.receive(msg(1, 'multiplayer', { action: 'create' })),
    true,
  );
  assert.equal(
    granted.receive(msg(1, 'multiplayer', { action: 'create' })),
    false,
  );
  granted.pause();
  assert.equal(
    granted.receive(
      msg(2, 'multiplayer', { action: 'input', input: drive(2) }),
    ),
    false,
  );
  assert.equal(
    granted.receive(msg(3, 'multiplayer', { action: 'ready', ready: true })),
    true,
  );
  granted.dispose();
  assert.equal(received, 2);
  assert.equal(disposed, 1);
});

test(
  'real sockets: private room lifecycle, authority, isolation, capacity and reconnect',
  { skip: !built, timeout: 45000 },
  async () => {
    const { startKartServer } =
      await import('../packages/old-san-juan-kart/multiplayer/server.mjs');
    const w = await startKartServer({
      allowHeadless: true,
      origins: ['https://allowed.example'],
    });
    const client = new Client(`http://127.0.0.1:${w.port}`),
      rooms = [];
    const join = async (id) => {
      const r = id
        ? await client.joinById(id, { build: KART_BUILD })
        : await client.create(ROOM_NAME, { build: KART_BUILD });
      rooms.push(r);
      r.onMessage('snapshot', (s) => (r.latest = s));
      return r;
    };
    try {
      const response = await fetch(
        `http://127.0.0.1:${w.port}/matchmake/create/${ROOM_NAME}`,
        {
          method: 'POST',
          headers: {
            Origin: 'https://evil.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ build: KART_BUILD }),
        },
      );
      assert.equal(response.status, 403);
      const directory = await fetch(
        `http://127.0.0.1:${w.port}/matchmake/${ROOM_NAME}`,
      );
      assert.equal(directory.status, 404);
      await assert.rejects(client.create(ROOM_NAME, { build: 'wrong' }));
      const a = await join(),
        b = await join(a.roomId),
        c = await join(a.roomId),
        d = await join(a.roomId),
        isolated = await join();
      await assert.rejects(join(a.roomId));
      await until(
        () =>
          a.latest?.players.length === 4 &&
          isolated.latest?.players.length === 1,
      );
      b.send('command', { action: 'start' });
      await pause(250);
      assert.equal(a.latest.phase, 'lobby');
      a.send('command', { action: 'start' });
      await pause(250);
      assert.equal(a.latest.phase, 'lobby');
      // A rapid change of mind must not leave the UI stuck on the previous state.
      a.send('command', { action: 'ready', ready: true });
      await until(
        () => a.latest.players.find((p) => p.id === a.sessionId)?.ready,
      );
      a.send('command', { action: 'ready', ready: false });
      await until(
        () => !a.latest.players.find((p) => p.id === a.sessionId)?.ready,
      );
      for (const r of [a, b, c, d])
        r.send('command', { action: 'ready', ready: true });
      await until(() => a.latest.players.every((p) => p.ready));
      await pause(220);
      a.send('command', { action: 'start' });
      await until(() => a.latest.phase === 'countdown');
      await assert.rejects(join(a.roomId));
      await until(() => a.latest.phase === 'racing');
      assert.equal(isolated.latest.phase, 'lobby');
      const initial = a.latest.karts.find((k) => k.id === a.sessionId);
      for (let i = 0; i < 10; i++) {
        a.send('command', { action: 'input', input: drive(i) });
        await pause(35);
      }
      await until(
        () => a.latest.karts.find((k) => k.id === a.sessionId).speed > 2,
      );
      assert.ok(
        a.latest.karts.find((k) => k.id === a.sessionId).x !== initial.x,
      );
      a.send('command', {
        action: 'input',
        input: drive(500, { x: 9999, lap: 3 }),
      });
      await pause(100);
      assert.equal(a.latest.karts.find((k) => k.id === a.sessionId).lap, 0);
      assert.deepEqual(
        a.latest.players.map((p) => p.id),
        b.latest.players.map((p) => p.id),
      );
      const sid = b.sessionId;
      b.reconnection.minUptime = 0;
      b.reconnection.minDelay = 100;
      b.reconnection.delay = 100;
      let dropped = false,
        reconnected = false;
      b.onDrop(() => (dropped = true));
      b.onReconnect(() => (reconnected = true));
      b.connection.close(4010);
      await until(() => dropped && reconnected);
      assert.equal(b.sessionId, sid);
      await until(() => a.latest.players.find((p) => p.id === sid)?.connected);
      const authoritative = matchMaker.getLocalRoomById(a.roomId);
      const savedSeq = authoritative.players.get(a.sessionId).seq;
      a.send('command', { action: 'input', input: drive(0) });
      await pause(70);
      assert.equal(authoritative.players.get(a.sessionId).seq, savedSeq);
      await pause(300);
      assert.ok(
        authoritative.elapsed -
          authoritative.players.get(a.sessionId).lastInput >
          0.25,
      );
      // Complete server-side state only; there is deliberately no remote finish command.
      authoritative.simulation.finishDeadline = authoritative.simulation.time;
      await until(() => a.latest.phase === 'results');
      assert.ok(a.latest.karts.every((k) => k.dnf));
      b.send('command', { action: 'rematch' });
      await pause(250);
      assert.equal(a.latest.phase, 'results');
      a.send('command', { action: 'rematch' });
      await until(() => a.latest.phase === 'lobby');
      assert.ok(a.latest.players.every((p) => !p.ready));
      await a.leave();
      await until(() => b.latest.owner === b.sessionId);
      assert.equal(isolated.latest.players.length, 1);
    } finally {
      await Promise.allSettled(
        rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
      );
      await w.close();
    }
  },
);

test(
  'server physics completes three ordered laps and ends with common results; stale inputs cannot drive',
  { skip: !built },
  async () => {
    const { KartSimulation, STEP } =
      await import('../packages/old-san-juan-kart/multiplayer/simulation.mjs');
    const { AIDriver } = await import('../dist/kart-server/ai.js');
    const sim = new KartSimulation([
      { id: 'a', name: 'A', slot: 0 },
      { id: 'b', name: 'B', slot: 1 },
    ]);
    const drivers = sim.karts.map((k) => new AIDriver(k, sim.race.track, 3));
    for (const d of drivers) {
      d.personality = 0;
      d.wobblePhase = 0;
    }
    for (let i = 0; i < 60 * 605 && !sim.done; i++) {
      const world = { time: sim.time, hazards: [], karts: sim.karts };
      sim.step(new Map(drivers.map((d) => [d.kart.id, d.update(STEP, world)])));
    }
    assert.equal(sim.done, true);
    assert.ok(
      sim.karts.every((k) => k.lap === 3 && !k.dnf),
      JSON.stringify(sim.snapshot()),
    );
    assert.deepEqual(
      sim
        .snapshot()
        .map((k) => k.rank)
        .sort(),
      [1, 2],
    );
    const stopped = new KartSimulation([{ id: 'a', name: 'A', slot: 0 }]);
    for (let i = 0; i < 600; i++) stopped.step(new Map());
    assert.equal(stopped.karts[0].lap, 0);
    assert.equal(stopped.karts[0].speed, 0);
  },
);

test('LAN preview nonces use secure random bytes without requiring randomUUID', () => {
  const nonce = createRuntimeNonce({
    getRandomValues: (bytes) => {
      bytes.fill(171);
      return bytes;
    },
  });
  assert.equal(nonce, 'ab'.repeat(16));
  assert.throws(() => createRuntimeNonce({}));
});
