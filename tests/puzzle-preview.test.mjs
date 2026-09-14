import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  verifySource,
  selections,
  buildPuzzle,
} from '../packages/puzzle-preview/build.mjs';
test('puzzle source selection rejects changed or uninventoried bytes', () => {
  const b = Buffer.from('known source');
  const entry = {
    gitObjectId: createHash('sha1')
      .update(`blob ${b.length}\0`)
      .update(b)
      .digest('hex'),
  };
  assert.doesNotThrow(() => verifySource(b, entry));
  assert.throws(
    () => verifySource(Buffer.from('changed source'), entry),
    /mismatch/,
  );
  assert.throws(() => verifySource(b, undefined), /mismatch/);
  assert.throws(() => buildPuzzle('../hextris'), /Unknown/);
});
test('puzzle ports exclude unknown vendor, font, artwork and network bootstraps', () => {
  for (const [id, paths] of Object.entries(selections)) {
    const inventory = JSON.parse(
      readFileSync(
        new URL(`../compliance/source-inventories/${id}.json`, import.meta.url),
      ),
    );
    assert.ok(
      paths.every((path) => inventory.files.some((f) => f.path === path)),
    );
    assert.ok(
      paths.every((path) => !/^vendor\/|^images\/|^style\//.test(path)),
    );
    assert.ok(!paths.includes('js/initialization.js'));
    assert.ok(!paths.includes('js/local_storage_manager.js'));
    assert.ok(!paths.includes('js/save-state.js'));
  }
});
import { validSave as valid2048 } from '../packages/2048/src/save.js';
import { validSave as validHextris } from '../packages/hextris/src/save.js';
test('puzzle saves reject malformed board coordinates, non-powers, score and schema data', () => {
  const good = {
    score: 0,
    over: false,
    won: false,
    keepPlaying: false,
    grid: {
      size: 4,
      cells: Array.from({ length: 4 }, () => Array(4).fill(null)),
    },
  };
  assert.equal(valid2048(good), true);
  for (const bad of [
    null,
    {},
    { ...good, score: -1 },
    { ...good, won: 'yes' },
    { ...good, grid: { size: 4, cells: [[null]] } },
  ])
    assert.equal(valid2048(bad), false);
  good.grid.cells[0][0] = { value: 3, position: { x: 0, y: 0 } };
  assert.equal(valid2048(good), false);
  good.grid.cells[0][0] = { value: 2, position: { x: 1, y: 0 } };
  assert.equal(valid2048(good), false);
  assert.equal(validHextris({ best: 12 }), true);
  for (const bad of [null, {}, { best: -1 }, { best: Infinity }, { best: '3' }])
    assert.equal(validHextris(bad), false);
});
