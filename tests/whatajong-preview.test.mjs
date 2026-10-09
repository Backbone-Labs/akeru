import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selections, adaptModule } from '../packages/whatajong/build.mjs';
import { validSave } from '../packages/whatajong/src/save.js';
test('Whatajong source recipe includes actual engine but excludes unknown assets and network/storage entrypoints', () => {
  const inv = JSON.parse(
    readFileSync(
      new URL(
        '../compliance/source-inventories/whatajong.json',
        import.meta.url,
      ),
    ),
  );
  assert.equal(inv.revision, '45fe3da7a7d1e87a66ae41b72ee74cc4e0a920d5');
  for (const path of selections) {
    assert.ok(inv.files.some((f) => f.path === path));
    assert.ok(
      path === 'LICENSE' ||
        /^src\/renderer\/lib\/(maps\/responsive|game|in-memoriam|setMethods|rand|setupTiles|resolve\w+)\.ts$/.test(
          path,
        ),
    );
  }
  assert.ok(selections.includes('src/renderer/lib/setupTiles.ts'));
  assert.throws(
    () => adaptModule(Buffer.from('import {x} from "unknown-package"; x();')),
    /Unreviewed/,
  );
  assert.throws(
    () =>
      adaptModule(Buffer.from('import {x} from "https://example.com/x"; x();')),
    /Unreviewed/,
  );
});
test('Whatajong restore rejects malformed or special-tile state before upstream execution', () => {
  const good = {
    version: 1,
    points: 0,
    tiles: Array.from({ length: 54 }, (_, i) => ({
      id: String(i + 1),
      cardId: `${['bam', 'crack', 'dot'][Math.floor(i / 18)]}${(Math.floor(i / 2) % 9) + 1}`,
      material: 'bone',
      x: i % 16,
      y: Math.floor(i / 16),
      z: 0,
      selected: false,
      deleted: false,
    })),
  };
  assert.equal(validSave(good), true);
  for (const value of [
    null,
    {},
    { ...good, version: 2 },
    { ...good, points: Infinity },
    { ...good, tiles: [] },
    {
      ...good,
      tiles: good.tiles.map((t, i) => (i ? t : { ...t, cardId: 'joker' })),
    },
    { ...good, tiles: good.tiles.map((t, i) => (i ? t : { ...t, x: NaN })) },
    { ...good, tiles: good.tiles.map((t, i) => (i ? t : { ...t, id: '2' })) },
  ])
    assert.equal(validSave(value), false);
});
