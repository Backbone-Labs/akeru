import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  SnapshotBuffer,
  KartPrediction,
  interpolate,
} from '../packages/old-san-juan-kart/src/network-motion.js';
import {
  capturePhysics,
  STEP,
} from '../packages/old-san-juan-kart/src/network-state.js';
const at = (t) => ({
  x: t * 10,
  y: 0,
  z: 0,
  vx: 10,
  vy: 0,
  vz: 0,
  speed: 10,
  pitch: 0,
  roll: 0,
  steerVisual: 0,
  wheelSpin: (t * 10) / 0.42,
  nx: 0,
  ny: 1,
  nz: 0,
  boostTime: 0,
  yaw: 0,
  visualYaw: 0,
  suspension: [0, 0, 0, 0],
  teleport: 0,
});
test('remote racing stays continuous under 60–150ms jitter and reordered updates', () => {
  const buffer = new SnapshotBuffer(),
    arrivals = [];
  for (let i = 0; i < 100; i++) {
    const time = i * 0.05;
    arrivals.push({
      time,
      arrival: time + [0.06, 0.13, 0.07, 0.15, 0.09, 0.08][i % 6],
    });
  }
  arrivals.sort((a, b) => a.arrival - b.arrival);
  let last,
    minimum = Infinity,
    maximum = -Infinity,
    count = 0;
  for (let now = 0; now < 4.8; now += 1 / 120) {
    while (arrivals[0]?.arrival <= now) {
      const next = arrivals.shift();
      buffer.push(next.time, at(next.time), next.arrival);
    }
    const value = buffer.sample(now);
    if (value && last && now > 0.6) {
      const speed = (value.x - last.x) * 120;
      minimum = Math.min(minimum, speed);
      maximum = Math.max(maximum, speed);
      count++;
    }
    last = value;
  }
  assert.ok(count > 400);
  assert.ok(
    minimum > 8.5,
    `minimum speed ${minimum}: should not stall between packets`,
  );
  assert.ok(
    maximum < 11.5,
    `maximum speed ${maximum}: should not jump to arrivals`,
  );
});
test('interpolation respects respawns, angle wrapping and bounded network gaps', () => {
  const a = { ...at(0), yaw: Math.PI - 0.01, visualYaw: Math.PI - 0.01 },
    b = { ...at(0.05), yaw: -Math.PI + 0.01, visualYaw: -Math.PI + 0.01 };
  assert.ok(Math.abs(interpolate(a, b, 0.5).visualYaw - Math.PI) < 0.001);
  assert.equal(interpolate(a, { ...b, teleport: 1, x: 50 }, 0.2).x, 50);
  const buffer = new SnapshotBuffer();
  buffer.push(0, at(0), 0);
  for (let now = 0; now < 5; now += 0.02)
    assert.ok(buffer.sample(now).x <= 1.001);
  buffer.push(-1, at(-1), 5);
  assert.equal(buffer.samples.length, 1);
});
const built = existsSync(
  new URL('../dist/kart-server/kart.js', import.meta.url),
);
test(
  'real Kart physics predicts before an update, replays partial acknowledgements and smooths corrections',
  { skip: !built },
  async () => {
    const { Kart } = await import('../dist/kart-server/kart.js');
    const { Track } = await import('../dist/kart-server/track.js');
    const { CHARACTERS } = await import('../dist/kart-server/characters.js');
    const { KartSimulation } =
      await import('../packages/old-san-juan-kart/multiplayer/simulation.mjs');
    const sim = new KartSimulation([{ id: 'a', slot: 0, name: 'A' }]);
    sim.countdown = 0;
    const local = new Kart(null, CHARACTERS[0]);
    const predictor = new KartPrediction(local, new Track());
    predictor.reconcile(
      { ...sim.prediction('a'), ackSeq: -1, inputTicks: 0 },
      0,
    );
    const input = { throttle: 1, brake: 0, steer: 0.3, drift: false };
    const initial = local.position.clone();
    predictor.advance(input, 0, 1);
    predictor.advance(input, 0, 2);
    assert.ok(
      local.position.distanceTo(initial) > 0,
      'local car reacts before server sends a snapshot',
    );
    sim.step(new Map([['a', input]]));
    const checkpoint = capturePhysics(sim.karts[0]);
    const before = predictor.render(1, STEP);
    predictor.reconcile(
      { physics: checkpoint, teleport: 0, ackSeq: 0, inputTicks: 1 },
      0.05,
    );
    assert.equal(predictor.history.length, 1);
    sim.step(new Map([['a', input]]));
    assert.ok(
      local.position.distanceTo(sim.karts[0].position) < 1e-8,
      'only the unacknowledged half of a command replays',
    );
    const after = predictor.render(1, 0);
    assert.ok(
      Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) <
        1e-8,
      'snapshot does not rewind the visible car/camera',
    );
    // A real drift/hop needs hidden physics state as well as XYZ to reconcile correctly.
    for (let i = 2; i < 150; i++) {
      const command = { ...input, drift: i >= 45 && i < 130 };
      sim.step(new Map([['a', command]]));
      predictor.advance(command, Math.floor(i / 2), (i % 2) + 1);
      if (i % 3 === 0) {
        const view = predictor.render(1, STEP);
        predictor.reconcile(
          {
            ...sim.prediction('a'),
            ackSeq: Math.floor(i / 2),
            inputTicks: (i % 2) + 1,
          },
          i * STEP,
        );
        const corrected = predictor.render(1, 0);
        assert.ok(
          Math.hypot(view.x - corrected.x, view.z - corrected.z) < 1e-7,
        );
      }
    }
    assert.ok(local.position.distanceTo(sim.karts[0].position) < 1e-7);
    assert.equal(local.driftTier, sim.karts[0].driftTier);
    const moved = {
      ...sim.prediction('a'),
      teleport: 1,
      ackSeq: 999,
      inputTicks: 1,
    };
    moved.physics.position = [100, 2, 100];
    predictor.reconcile(moved, 3);
    assert.equal(predictor.history.length, 0);
    assert.equal(predictor.render(1, 0).x, 100);
    for (let i = 0; i < 500; i++) predictor.advance(input, i, 1);
    assert.equal(predictor.history.length, 120);
  },
);
