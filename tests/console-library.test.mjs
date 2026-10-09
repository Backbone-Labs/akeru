import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLibrary,
  readRecent,
  setLibraryEntry,
  libraryAfter,
  greetingFor,
  lastPlayedLabel,
} from '../platform/catalog/home.js';
import {
  slotLabel,
  formatBytes,
  sourceLabel,
} from '../platform/catalog/game-sheet.js';
import { describeController } from '../platform/catalog/console-ui.js';

const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test('saved library stays bounded, deduplicated and separate from play history', () => {
  const storage = memory();
  for (let i = 0; i < 205; i++) setLibraryEntry(storage, `game-${i}`, true, i);
  assert.equal(readLibrary(storage).length, 200);
  assert.deepEqual(readLibrary(storage)[0], { id: 'game-204', at: 204 });
  setLibraryEntry(storage, 'game-10', true, 999);
  assert.deepEqual(readLibrary(storage)[0], { id: 'game-10', at: 999 });
  assert.equal(
    readLibrary(storage).filter((row) => row.id === 'game-10').length,
    1,
  );
  setLibraryEntry(storage, 'game-204', false);
  assert.equal(
    readLibrary(storage).some((row) => row.id === 'game-204'),
    false,
  );
  assert.deepEqual([...storage.values.keys()], ['akeru.library.v1']);
  assert.deepEqual(readRecent(storage), []);
});

test('saved library rejects unsafe ids, timestamps and malformed storage', () => {
  const storage = memory();
  setLibraryEntry(storage, 'anarch', true, 5);
  const before = readLibrary(storage);
  for (const id of [
    '../account',
    'Anarch',
    '',
    'a'.repeat(65),
    'trailing-',
    42,
    null,
    { id: 'anarch' },
  ])
    assert.deepEqual(setLibraryEntry(storage, id, true, 10), before);
  for (const at of [-1, 1.5, Number.NaN, '10', Number.MAX_SAFE_INTEGER + 1])
    assert.deepEqual(setLibraryEntry(storage, 'hextris', true, at), before);
  const rows = [{ id: 'anarch', at: 1 }];
  const next = libraryAfter(rows, 'hextris', true, 2);
  assert.deepEqual(rows, [{ id: 'anarch', at: 1 }], 'input is not mutated');
  assert.deepEqual(next, [
    { id: 'hextris', at: 2 },
    { id: 'anarch', at: 1 },
  ]);
  storage.values.set(
    'akeru.library.v1',
    JSON.stringify([
      { id: 'anarch', at: 3, token: 'discard', save: 'discard' },
      { id: 'anarch', at: 1 },
      { id: '../../account', at: 2 },
      'not-a-row',
      null,
      { id: 'hextris', at: '2' },
    ]),
  );
  assert.deepEqual(readLibrary(storage), [{ id: 'anarch', at: 3 }]);
  storage.values.set('akeru.library.v1', '{"id":"anarch","at":1}');
  assert.deepEqual(readLibrary(storage), []);
  storage.values.set('akeru.library.v1', 'not json');
  assert.deepEqual(readLibrary(storage), []);
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readLibrary(blocked), []);
  assert.doesNotThrow(() => setLibraryEntry(blocked, 'anarch', true));
  assert.deepEqual(readLibrary(null), []);
});

test('console copy reports real time, never invented progress', () => {
  assert.equal(greetingFor(new Date(2026, 0, 1, 8)), 'Good morning');
  assert.equal(greetingFor(new Date(2026, 0, 1, 13)), 'Good afternoon');
  assert.equal(greetingFor(new Date(2026, 0, 1, 20)), 'Good evening');
  assert.equal(greetingFor(new Date(2026, 0, 1, 3)), 'Good evening');
  const now = Date.UTC(2026, 8, 28, 12);
  assert.equal(lastPlayedLabel(now - 20_000, now), 'Played just now');
  assert.equal(lastPlayedLabel(now + 60_000, now), 'Played just now');
  assert.equal(
    lastPlayedLabel(now - 2 * 3600_000, now),
    'Last played 2 hours ago',
  );
  assert.equal(
    lastPlayedLabel(now - 26 * 3600_000, now),
    'Last played yesterday',
  );
  assert.equal(
    lastPlayedLabel(now - 3 * 86400_000, now),
    'Last played 3 days ago',
  );
});

test('save and source labels are derived from host data without prototype lookups', () => {
  assert.equal(slotLabel('progress'), 'Auto-save');
  assert.equal(slotLabel('snapshot'), 'Manual snapshot');
  assert.equal(slotLabel('world_1-3'), 'World 1 3');
  assert.equal(slotLabel('constructor'), 'Constructor');
  assert.equal(slotLabel('toString'), 'ToString');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1 MB');
  for (const bad of [-1, 1.5, Number.NaN, '12', null])
    assert.equal(formatBytes(bad), '');
  assert.equal(
    sourceLabel('https://github.com/Backbone-Labs/akeru'),
    'View source on GitHub',
  );
  assert.equal(
    sourceLabel('https://www.example.org/src.tar.gz'),
    'View source on example.org',
  );
  assert.equal(sourceLabel('not a url'), 'View source');
});

test('controller status only describes connected pads and never reports battery', () => {
  assert.equal(describeController([]), null);
  assert.equal(describeController(undefined), null);
  assert.equal(
    describeController([null, { connected: false, id: 'Backbone One' }]),
    null,
  );
  assert.equal(
    describeController([{ connected: true, id: 'Backbone One (STANDARD)' }]),
    'Backbone controller connected',
  );
  assert.equal(
    describeController([{ connected: true, id: 'Xbox Wireless Controller' }]),
    'Controller connected',
  );
});
