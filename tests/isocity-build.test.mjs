import test from 'node:test';
import assert from 'node:assert/strict';
import { selectIsoCityCore } from '../packages/isocity/build.mjs';
test('IsoCity core selection excludes borrowed helper and URL state', () => {
  const source =
    'const ToBase64 = unknown;\nhistory.pushState();\nconst click = e => { place(e); };\nconst drawMap = () => {};';
  const selected = selectIsoCityCore(source);
  assert.match(selected, /const click/);
  assert.ok(!selected.includes('ToBase64'));
  assert.ok(!selected.includes('history'));
  assert.throws(() => selectIsoCityCore('changed source'), /core missing/);
  assert.throws(
    () => selectIsoCityCore('const click = e => { history.pushState(); }'),
    /Excluded helper/,
  );
});
