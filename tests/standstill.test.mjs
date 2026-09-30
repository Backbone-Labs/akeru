import test from 'node:test';
import assert from 'node:assert/strict';
import { idle, input, look } from '../packages/standstill/src/input.js';
import { rewriteImports } from '../packages/creator-preview/imports.mjs';

test('Standstill controller normalizes movement, preserves keyboard and edges grab/throw', () => {
  const game = {};
  const pad = {
    axes: { moveX: 1, moveY: -1 },
    buttons: { west: 1, leftTrigger: 1, rightTrigger: 1, confirm: 1 },
  };
  const first = input(idle, pad, game);
  assert.equal(Math.hypot(first.mx, first.mz), 1);
  assert.ok(first.mz > 0);
  assert.equal(first.grab, true);
  assert.equal(first.throw, true);
  assert.equal(first.fire, true);
  assert.equal(first.jump, true);
  const held = input(idle, pad, game);
  assert.equal(held.grab, false);
  assert.equal(held.throw, false);
  assert.equal(held.fire, true);
  assert.deepEqual(input(idle, {}, game), idle);
  assert.equal(input(idle, { buttons: { north: 1 } }, game).throw, true);
  assert.equal(input({ ...idle, mz: 1, grab: true }, {}, game).mz, 1);
  assert.equal(input({ ...idle, grab: true }, {}, game).grab, true);
});

test('Standstill stick aiming is time-based and preserves mouse deltas', () => {
  const pad = { axes: { lookX: 0.5, lookY: -1 } };
  const a = look({ dx: 0, dy: 0 }, pad, 1 / 60);
  const b = look({ dx: 0, dy: 0 }, pad, 1 / 30);
  assert.equal(a.dx * 2, b.dx);
  assert.equal(a.dy * 2, b.dy);
  assert.ok(a.dx > 0 && a.dy < 0);
  assert.deepEqual(look({ dx: 2, dy: 3 }, {}, 1 / 60), { dx: 2, dy: 3 });
  assert.deepEqual(look({ dx: 0, dy: 0 }, pad, 0), { dx: 0, dy: 0 });
  assert.equal(look({ dx: 0, dy: 0 }, pad, 10).dy, -50);
});

test('Creator import rewriting follows syntax, never comment examples or arbitrary strings', () => {
  const code = `// import bad from 'https://example.invalid/never.js';
import { x }\nfrom './real.js';
export { x } from './export.js';
export * from './all.js';
const module = import('./lazy.js');
const text = "from 'https://example.invalid/string.js'";`;
  const seen = [];
  const result = rewriteImports(code, (s) => {
    seen.push(s);
    return s.replace('.js', '--built.js');
  });
  assert.deepEqual(seen, ['./real.js', './export.js', './all.js', './lazy.js']);
  assert.ok(
    result.includes("// import bad from 'https://example.invalid/never.js';"),
  );
  assert.ok(result.includes("from 'https://example.invalid/string.js'"));
  assert.ok(result.includes('import("./lazy--built.js")'));
  assert.throws(
    () => rewriteImports('import(destination)', (s) => s),
    /Computed title import/,
  );
  assert.throws(() => rewriteImports('import(', (s) => s));
});

test('short touch action edges survive release before the rendering frame and consume once', () => {
  const game = {
    akeruPending: { jump: true, fire: true, grab: true, throw: true },
  };
  const tapped = input(idle, {}, game);
  for (const action of ['jump', 'fire', 'grab', 'throw'])
    assert.equal(tapped[action], true);
  assert.deepEqual(input(idle, {}, game), idle);
});
