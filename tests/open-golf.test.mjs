import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, decodeSave } from '../packages/open-golf/src/input.js';
import { feasibility } from '../packages/hypersomnia/feasibility.mjs';
test('Open Golf maps host touch and controller consistently, releases and rejects nonfinite input', () => {
  assert.deepEqual(
    normalizeInput({ axes: { moveX: 1, moveY: -1 }, buttons: { confirm: 1 } }),
    normalizeInput({ buttons: { right: 1, up: 1, confirm: 1 } }),
  );
  assert.deepEqual(
    normalizeInput({
      axes: { moveX: NaN, lookX: Infinity },
      buttons: { confirm: 'yes' },
    }),
    normalizeInput(),
  );
  assert.equal(normalizeInput({ axes: { moveX: 12 } }).x, 1);
});
test('Open Golf accepts only bounded title progress, rejects corrupted and foreign save data', () => {
  const bytes = (obj) => new TextEncoder().encode(JSON.stringify(obj));
  assert.deepEqual(
    decodeSave(bytes({ seen_tutorial_0: 1, stroke_count_level_19: 4 })),
    bytes({ seen_tutorial_0: 1, stroke_count_level_19: 4 }),
  );
  for (const obj of [
    null,
    [],
    { accountToken: 'secret' },
    { stroke_count_level_20: 1 },
    { stroke_count_level_0: -1 },
    { seen_tutorial_0: '1' },
  ])
    assert.throws(() => decodeSave(bytes(obj)));
  assert.throws(() => decodeSave(new Uint8Array(8193)));
  assert.throws(() => decodeSave(new Uint8Array([255])));
});
test('Hypersomnia feasibility does not pretend to be a playable publication', () => {
  assert.equal(feasibility.playable, false);
  assert.equal(feasibility.publicationApproval, 'pending');
  assert.equal(feasibility.status, 'feasibility-only');
  assert.ok(feasibility.blockers.some((b) => b.includes('BUILD_WEBRTC')));
});
