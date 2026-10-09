// After explicit client/server builds; exercises their real simulation, without cloud calls.
import assert from 'node:assert/strict';
import { followCamera } from './src/framing.js';
for (const base of [
  '../../dist/bubblekick-server/shared/',
  '../../dist/bubblekick/shared--',
]) {
  const mod = (name) =>
    import(
      new URL(
        base + name.replaceAll('/', base.endsWith('--') ? '--' : '/') + '.js',
        import.meta.url,
      )
    );
  const { createWorld, step } = await mod('sim/world');
  const { collideBallArena, collideWalls, goalCrossed } =
    await mod('sim/arena');
  const { doShot } = await mod('sim/actions');
  const { pkEnter } = await mod('sim/pk');
  const { sanitizeSettings } = await mod('protocol');
  const { FIELD } = await mod('constants');
  assert.equal(sanitizeSettings({ fieldSize: 'large' }).fieldSize, 'large');
  for (const value of [undefined, null, 'huge', {}, 1])
    assert.equal(sanitizeSettings({ fieldSize: value }).fieldSize, 'standard');
  const normal = createWorld({ seed: 33 }),
    large = createWorld({ seed: 33, settings: { fieldSize: 'large' } });
  const normalAlone = createWorld({ seed: 33 }),
    largeAlone = createWorld({ seed: 33, settings: { fieldSize: 'large' } });
  assert.deepEqual([large.field.halfLength, large.field.halfWidth], [40, 25]);
  assert.deepEqual([normal.field.halfLength, normal.field.halfWidth], [30, 19]);
  // Interleaved rooms, AI, player/ball collisions, goals and penalties must be deterministic and isolated.
  for (let i = 0; i < 9000; i++) {
    step(normal);
    step(large);
  }
  for (let i = 0; i < 9000; i++) step(normalAlone);
  for (let i = 0; i < 9000; i++) step(largeAlone);
  assert.deepEqual(normal, normalAlone);
  assert.deepEqual(large, largeAlone);
  assert.equal(FIELD.halfLength, 30);
  for (const fieldSize of ['standard', 'large']) {
    const world = createWorld({
      settings: { fieldSize, bots: false },
      humans: [{ team: 0 }],
    });
    const field = world.field;
    const player = { x: field.halfLength + 5, z: 0, vx: 5, vz: 0 };
    collideWalls(player, 1.05, 0.45, true, field);
    assert.equal(player.x, field.halfLength - 1.05);
    assert(player.vx < 0);
    const ball = {
      x: 0,
      z: field.halfWidth + 1,
      y: 0.48,
      vx: 0,
      vz: 10,
      vy: 0,
    };
    collideBallArena(ball, field);
    assert.equal(ball.z, field.halfWidth - 0.48);
    assert(ball.vz < 0);
    assert.equal(
      goalCrossed({ x: 31, z: 0, y: 0.48 }, field),
      fieldSize === 'large' ? 0 : 1,
    );
    assert.equal(
      goalCrossed({ x: field.halfLength + 1, z: 0, y: 0.48 }, field),
      1,
    );
    world.phase = 'play';
    Object.assign(world.players[3], {
      x: field.halfLength - 20,
      z: 0,
      fx: 1,
      fz: 0,
    });
    Object.assign(world.ball, {
      owner: 3,
      x: field.halfLength - 18.5,
      z: 0,
      y: 0.48,
    });
    doShot(world, world.players[3], 1, 0, 1, true);
    for (let i = 0; i < 120 && !world.score[0]; i++) step(world, [{}]);
    assert.equal(world.score[0], 1);
    const pk = createWorld({ settings: { fieldSize } });
    pkEnter(pk);
    for (let i = 0; i < 900; i++) step(pk);
    assert(
      pk.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)),
    );
  }
  console.log(
    'PASS field bounds, goal lines, scoring, AI/penalties, invalid settings and interleaved room isolation:',
    base,
  );
}
const { LocalSession, OnlineSession } =
  await import('../../dist/bubblekick/game--sessions.js');
const settings = { fieldSize: 'large' };
for (const session of [
  new LocalSession({ settings, humans: [{ team: 0 }] }),
  new OnlineSession({
    net: { on: () => () => {} },
    start: { settings, humans: [{ team: 0 }], you: [0] },
  }),
]) {
  assert.equal(session.view.field.halfLength, 40);
  assert.equal(session.world.field.halfLength, 40);
  const state = session.view;
  Object.assign(state.players[3], { x: 38, z: 23, vx: 0, vz: 0 });
  Object.assign(state.ball, { x: 38, z: 23 });
  const camera = followCamera(state, [0], 16 / 9);
  assert(camera.x > 30 && camera.z > 19);
  assert.equal(camera.distance, 35);
}
const { DEFAULT_SAVE, validateSave } =
  await import('../../dist/bubblekick/game-storage.js');
const save = DEFAULT_SAVE();
save.last.fieldSize = 'large';
assert.equal(validateSave(save).last.fieldSize, 'large');
save.last.fieldSize = 'bad';
assert.equal(validateSave(save).last.fieldSize, 'standard');
console.log(
  'PASS local/online field views, player-follow camera, saved preference validation',
);
