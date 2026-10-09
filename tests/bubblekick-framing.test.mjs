import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { followCamera } from '../packages/bubblekick/src/framing.js';
const state = (x, z, bx = 0, bz = 0) => ({
  ball: { x: bx, z: bz },
  players: [{ x, z, vx: 0, vz: 0, active: true }],
  humans: [{ player: 0 }],
});
test('camera follows the controlled player rather than the ball and stays closer than the full-field view', () => {
  const a = followCamera(state(-20, 0, 25), [0], 2.16),
    b = followCamera(state(20, 0, -25), [0], 2.16);
  assert(a.x < -15);
  assert(b.x > 15);
  assert(a.distance >= 35 && a.distance <= 40);
  assert(b.distance >= 35 && b.distance <= 40);
});
test('player and nearby touchline stay in frame at the edges of the pitch', () => {
  for (const aspect of [852 / 393, 393 / 852, 1024 / 768, 1920 / 1080]) {
    for (const x of [-29, 0, 29])
      for (const z of [-18, 0, 18]) {
        const f = followCamera(state(x, z, -x, -z), [0], aspect);
        const camera = new PerspectiveCamera(40, aspect, 0.5, 900);
        camera.position.set(f.x, f.height, f.z + f.depth);
        camera.lookAt(f.x, 0, f.z);
        camera.updateMatrixWorld();
        for (const point of [
          [x, 1, z],
          [x, 0, Math.abs(z) > 10 ? (z < 0 ? -22 : 22) : z],
        ]) {
          const v = new Vector3(...point).project(camera);
          assert(
            Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9,
            `clipped ${aspect}: ${point}`,
          );
        }
      }
  }
});
test('without a local player the camera follows the ball; remote players do not move the focus', () => {
  const s = state(-25, -15, 10, 5);
  const f = followCamera(s, [], 2);
  assert.equal(f.x, 10);
  assert.equal(f.z, 5);
  const before = followCamera(s, [0], 2);
  s.players.push({ x: 30, z: 19 });
  assert.deepEqual(followCamera(s, [0], 2), before);
});
