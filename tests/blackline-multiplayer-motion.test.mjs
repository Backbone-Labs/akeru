import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  OperatorPrediction,
  RemoteTimeline,
  advanceMovement,
  movementState,
} from '../packages/operation-blackline/src/motion.js';
import { neutral } from '../packages/operation-blackline/multiplayer/protocol.js';
const built = existsSync(
  new URL('../dist/blackline-server/player.js', import.meta.url),
);
const pos = (actor) => [actor.pos.x, actor.pos.y, actor.pos.z];
function authority(actor, extra = {}) {
  return {
    p: pos(actor),
    velocity: [actor.vel.x, actor.vel.y, actor.vel.z],
    yaw: actor.yaw,
    pitch: actor.pitch,
    alive: true,
    spawn: 1,
    ackSeq: -1,
    inputTicks: 0,
    motion: movementState(actor, false),
    ...extra,
  };
}
test(
  'Blackline prediction replays only unacknowledged fixed ticks, including partial held-input acknowledgements',
  { skip: !built },
  async () => {
    const { createPlayer } = await import('../dist/blackline-server/player.js');
    const game = { world: { colliders: [] }, bus: { emit() {} } };
    const client = createPlayer(game),
      server = createPlayer(game),
      expected = createPlayer(game);
    const prediction = new OperatorPrediction(client);
    prediction.reconcile(authority(server), 0);
    const frames = Array.from({ length: 8 }, (_, i) => ({
      ...neutral(),
      seq: Math.floor(i / 2),
      moveX: 1,
      jump: i >= 4,
      yaw: i < 4 ? 0 : 0.4,
    }));
    let serverJump = false,
      expectedJump = false;
    for (let i = 0; i < frames.length; i++) {
      prediction.predict(frames[i]);
      expectedJump = advanceMovement(expected, frames[i], expectedJump);
      if (i < 3) serverJump = advanceMovement(server, frames[i], serverJump);
    }
    const cameraBefore = {
      eye: client._eye,
      bob: client._bobY,
      foot: client._footAcc,
    };
    client.yaw = 1.2;
    const state = authority(server, {
      ackSeq: 1,
      inputTicks: 1,
      motion: movementState(server, serverJump),
    });
    prediction.reconcile(state, 3);
    assert.deepEqual(pos(client), pos(expected));
    assert.deepEqual(
      [client.vel.x, client.vel.y, client.vel.z],
      [expected.vel.x, expected.vel.y, expected.vel.z],
    );
    assert.equal(prediction.history.length, 5);
    assert.equal(prediction.history[0].input.seq, 1);
    assert.equal(prediction.history[0].ordinal, 2);
    assert.equal(
      client.yaw,
      1.2,
      'replaying delayed commands never rewinds live look input',
    );
    assert.deepEqual(
      { eye: client._eye, bob: client._bobY, foot: client._footAcc },
      cameraBefore,
    );
    assert.equal(
      prediction.reconcile(state, 3),
      false,
      'duplicate snapshots cannot apply corrections twice',
    );
    assert.equal(
      prediction.reconcile({ ...state, p: [50, 0, 0] }, 2),
      false,
      'stale snapshots cannot rewind',
    );
  },
);
test(
  'Blackline reconciliation keeps camera continuous under latency, but snaps and clears history on respawn and reconnect',
  { skip: !built },
  async () => {
    const { createPlayer } = await import('../dist/blackline-server/player.js');
    const actor = createPlayer({
      world: { colliders: [] },
      bus: { emit() {} },
    });
    const prediction = new OperatorPrediction(actor);
    prediction.reconcile(authority(actor), 0);
    for (let i = 0; i < 12; i++)
      prediction.predict({ ...neutral(), seq: i, moveX: 1 });
    const before = pos(actor);
    const checkpoint = authority(actor, {
      p: [before[0] - 0.4, before[1], before[2]],
      ackSeq: 11,
      inputTicks: 1,
    });
    prediction.reconcile(checkpoint, 12);
    const correction = prediction.cameraOffset(0);
    assert.ok(Math.abs(actor.pos.x + correction[0] - before[0]) < 1e-9);
    const corrections = Array.from(
      { length: 30 },
      () => prediction.cameraOffset(1 / 60)[0],
    );
    assert.ok(corrections.every((v, i) => i === 0 || v < corrections[i - 1]));
    assert.ok(corrections.at(-1) < 0.002);
    prediction.predict({ ...neutral(), seq: 12, moveX: 1 });
    prediction.reconcile({ ...checkpoint, spawn: 2, p: [20, 0, -30] }, 13);
    assert.deepEqual(pos(actor), [20, 0, -30]);
    assert.equal(prediction.history.length, 0);
    assert.deepEqual(prediction.cameraOffset(0), [0, 0, 0]);
    prediction.predict({ ...neutral(), seq: 13, moveX: 1 });
    prediction.clear();
    prediction.reconcile({ ...checkpoint, p: [2, 0, 2] }, 1, { reset: true });
    assert.equal(prediction.history.length, 0);
    assert.deepEqual(pos(actor), [2, 0, 2]);
  },
);
const packet = (time, x, flags = 0, yaw = 0) => ({
  time,
  ps: [[1, 0, 'Operator', x, 0, 0, yaw, 0, flags, 0, 100, 0, 0]],
});
test('remote Blackline interpolation follows server time at steady speed despite bursty arrivals and rejects stale packets', () => {
  const remote = new RemoteTimeline(120),
    samples = [];
  const network = [];
  for (let t = 0; t <= 3000; t += 50)
    network.push({
      at: t + [60, 95, 65, 105, 60, 85][(t / 50) % 6],
      packet: packet(t, t * 0.0046),
    });
  network.sort((a, b) => a.at - b.at);
  for (let now = 0; now <= 3000; now += 10) {
    while (network[0]?.at <= now) {
      const value = network.shift();
      remote.push(value.packet, value.at);
    }
    const result = remote.getTransform(1, {}, now);
    if (result && now > 500) samples.push(result.p[0]);
  }
  const steps = samples.slice(1).map((x, i) => x - samples[i]);
  assert.ok(
    steps.every((dx) => dx > 0.043 && dx < 0.049),
    `motion must not pulse with arrivals: ${Math.min(...steps)}..${Math.max(...steps)}`,
  );
  const length = remote.samples.length;
  remote.push(packet(1, -900), 3100);
  assert.equal(remote.samples.length, length);
  assert.ok(remote.getTransform(1, {}, 3010).p[0] > samples.at(-1));
  remote.reset();
  assert.equal(remote.getTransform(1, {}, 3100), null);
  remote.push(packet(0, 0), 3200);
  remote.getTransform(1, {}, 3400);
  remote.push(packet(2000, 9.2), 5200);
  assert.ok(
    remote.cursor >= 1880,
    'a recovered connection does not chase seconds of old poses',
  );
});
test('remote Blackline respawns never interpolate across the map and angles cross the short arc', () => {
  const remote = new RemoteTimeline(0);
  remote.push(packet(0, 0, 0, Math.PI - 0.1), 0);
  remote.push(packet(100, 1, 0, -Math.PI + 0.1), 100);
  const halfway = remote.getTransform(1, {}, 50);
  assert.ok(Math.abs(halfway.yaw - Math.PI) < 0.01);
  remote.push(packet(200, 45), 200);
  const before = remote.getTransform(1, {}, 150);
  assert.equal(before.p[0], 1);
  assert.equal(remote.getTransform(1, {}, 201).p[0], 45);
});
