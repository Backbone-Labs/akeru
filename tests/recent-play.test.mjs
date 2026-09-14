import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecent, recordPlayed } from '../platform/catalog/home.js';
test('recent play stays bounded, deduplicated and contains only valid local title records', () => {
  let value = '[]';
  const storage = {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
  for (let i = 0; i < 30; i++) recordPlayed(storage, `game-${i}`, i);
  recordPlayed(storage, 'game-29', 40);
  assert.equal(readRecent(storage).length, 24);
  assert.deepEqual(readRecent(storage)[0], { id: 'game-29', at: 40 });
  value = JSON.stringify([
    { id: '../../account', at: 10 },
    { id: 'anarch', at: 2, token: 'discard' },
    { id: 'anarch', at: 1 },
    null,
  ]);
  assert.deepEqual(readRecent(storage), [{ id: 'anarch', at: 2 }]);
  value = 'invalid';
  assert.deepEqual(readRecent(storage), []);
  assert.doesNotThrow(() =>
    recordPlayed(
      {
        getItem() {
          throw Error();
        },
        setItem() {
          throw Error();
        },
      },
      'anarch',
    ),
  );
});
