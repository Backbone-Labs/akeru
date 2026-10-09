import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptPrelude,
  adaptLibrary,
  titles,
} from '../packages/tatham/build.mjs';
import { validateSave } from '../packages/tatham/src/save.js';
import { tathamOptions } from '../packages/tatham/catalog.mjs';
test('Tatham build fails closed if upstream storage or launch hooks change', () => {
  assert.throws(() => adaptPrelude('changed upstream'), /launch hook/);
  assert.equal(
    adaptPrelude("'arguments': [decodeURIComponent(location.hash)]"),
    "'arguments': []",
  );
  const hooks =
    'localStorage.setItem(location.pathname + " preferences", prefsdata);localStorage.getItem(location.pathname + " preferences")';
  assert.doesNotMatch(adaptLibrary(hooks), /localStorage/);
  assert.throws(
    () => adaptLibrary(hooks + ';sessionStorage.setItem("other", "x")'),
    /Unexpected direct storage/,
  );
  assert.throws(() => adaptLibrary('changed upstream'), /preference hooks/);
});
test('Collection exposes sixteen distinct engine identities and rejects unknown title paths', () => {
  assert.equal(titles.length, 16);
  assert.equal(new Set(titles.map((t) => t.id)).size, 16);
  assert.throws(() => tathamOptions('../../other'), /Unknown Tatham/);
});
test('Save envelope rejects cross-title, truncated, oversized and unsupported records', () => {
  const config = { engine: 'net', title: 'Net' };
  const value = {
    schemaVersion: 1,
    engine: 'net',
    data: "SAVEFILE:41:Simon Tatham's Portable Puzzle Collection\nVERSION :1:1\nGAME    :3:Net\nNSTATES :1:1\nSTATEPOS:1:1\n",
  };
  assert.equal(validateSave(value, config), true);
  for (const candidate of [
    null,
    {},
    { ...value, schemaVersion: 2 },
    { ...value, engine: 'mines' },
    { ...value, data: value.data.replace('3:Net', '5:Mines') },
    { ...value, data: 'SAVEFILE:' },
    { ...value, data: value.data + 'x'.repeat(524288) },
  ])
    assert.equal(validateSave(candidate, config), false);
});
