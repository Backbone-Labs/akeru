import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { fieldCameraDistance } from '../packages/bubblekick/src/framing.js';
test('Bubblekick keeps both touchlines and goals within phone, tablet and desktop viewports', () => {
  for (const [w, h] of [
    [852, 393],
    [393, 852],
    [1024, 768],
    [1920, 1080],
  ]) {
    const camera = new PerspectiveCamera(40, w / h, 0.5, 900),
      d = fieldCameraDistance(w / h);
    camera.position.set(0, d * 0.78, d * 0.8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    for (const x of [-34, 34])
      for (const z of [-22, 22]) {
        const p = new Vector3(x, 0, z).project(camera);
        assert(Math.abs(p.x) < 0.9, `${w}x${h}: goal clipped`);
        assert(Math.abs(p.y) < 0.78, `${w}x${h}: touchline clipped`);
      }
  }
});
