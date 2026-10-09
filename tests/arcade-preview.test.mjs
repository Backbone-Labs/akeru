import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSave as racer } from '../packages/racer/src/save.js';
import { validSave as hexgl } from '../packages/hexgl/src/save.js';
import { validSave as astray } from '../packages/astray/src/save.js';
import { validSave as breaklock } from '../packages/breaklock/src/save.js';
import {
  replaceRequired,
  beginBuild,
} from '../packages/arcade-preview/build.mjs';
test('title save boundaries reject malformed, excessive and foreign progress', () => {
  assert.ok(racer({ best: 12 }));
  assert.ok(hexgl({ best: 32000 }));
  for (const bad of [
    null,
    {},
    { best: -1 },
    { best: Infinity },
    { best: 1, secret: [] },
    { best: 86400001 },
  ]) {
    assert.equal(racer(bad), false);
    assert.equal(hexgl(bad), false);
  }
  const maze = {
    dimension: 11,
    maze: Array.from({ length: 11 }, () => Array(11).fill(false)),
    x: 1,
    y: 1,
  };
  assert.ok(astray(maze));
  for (const bad of [
    { ...maze, dimension: 10001 },
    { ...maze, x: NaN },
    { ...maze, maze: [[false]] },
    { ...maze, y: -1 },
  ])
    assert.equal(astray(bad), false);
  const lock = { secret: [0, 1, 2, 5], current: [0, 1], history: [], wins: 2 };
  assert.ok(breaklock(lock));
  for (const bad of [
    { ...lock, secret: [0, 0, 1, 2] },
    { ...lock, current: [9] },
    { ...lock, wins: -1 },
    { ...lock, history: Array(101).fill([0, 1, 2, 5]) },
  ])
    assert.equal(breaklock(bad), false);
  assert.equal(astray(lock), false);
  assert.equal(breaklock(maze), false);
});
test('build recipes fail closed on unknown titles and moved upstream anchors', () => {
  assert.throws(() => beginBuild('../racer'), /Unknown/);
  assert.throws(
    () => replaceRequired('new source', 'old source', 'patch'),
    /anchor/,
  );
  assert.equal(replaceRequired('old source', 'old source', 'patch'), 'patch');
  const recipe = readFileSync(
    new URL('../packages/racer/build.mjs', import.meta.url),
    'utf8',
  );
  assert.ok(!recipe.includes("b.read('images/"));
  assert.ok(!recipe.includes("b.read('music/"));
});
