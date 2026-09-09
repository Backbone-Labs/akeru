import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createSaveStore, SaveError } from '../packages/saves/src/index.js';

let databaseSequence = 0;
const factory = new IDBFactory();
const makeStore = () =>
  createSaveStore({
    indexedDB: factory,
    databaseName: `akeru-saves-test-${++databaseSequence}`,
  });
const value = (schemaVersion, bytes) => ({
  schemaVersion,
  bytes: new Uint8Array(bytes),
});
const hasCode = (code) => (error) =>
  error instanceof SaveError && error.code === code;

test('durably reads defensive copies and exposes a narrow game service', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const first = createSaveStore({ indexedDB: factory, databaseName }).forTitle({
    titleId: 'example-title',
    schemaVersion: 1,
  });
  assert.deepEqual(Object.keys(first.service).sort(), [
    'read',
    'remove',
    'status',
    'write',
  ]);

  const input = value(1, [1, 2]);
  const written = await first.write('progress', input, null);
  input.bytes[0] = 8;
  written.bytes[1] = 9;

  const reopened = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({ titleId: 'example-title', schemaVersion: 1 });
  assert.deepEqual([...(await reopened.read('progress')).bytes], [1, 2]);
  const status = await reopened.status();
  assert.deepEqual(status, {
    local: 'available',
    sync: 'disabled',
    quota: {
      usedSlots: 1,
      maxSlots: 16,
      usedBytes: 2,
      maxBytesPerSlot: 1048576,
    },
  });
});

test('CAS is atomic across store instances and revisions prevent ABA', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const options = { indexedDB: factory, databaseName };
  const a = createSaveStore(options).forTitle({
    titleId: 'race-title',
    schemaVersion: 1,
  });
  const b = createSaveStore(options).forTitle({
    titleId: 'race-title',
    schemaVersion: 1,
  });
  const initial = await a.write('progress', value(1, [0]), null);
  const results = await Promise.allSettled([
    a.write('progress', value(1, [1]), initial.revision),
    b.write('progress', value(1, [2]), initial.revision),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(hasCode('conflict')(rejected.reason));

  const current = await a.read('progress');
  await a.remove('progress', current.revision);
  const recreated = await b.write('progress', value(1, [3]), null);
  assert.notEqual(recreated.revision, current.revision);
  await assert.rejects(
    a.remove('progress', current.revision),
    hasCode('conflict'),
  );
});

test('title isolation applies to list, export and reset', async () => {
  const store = makeStore();
  const a = store.forTitle({ titleId: 'title-a', schemaVersion: 1 });
  const b = store.forTitle({ titleId: 'title-b', schemaVersion: 1 });
  await a.write('shared', value(1, [1]), null);
  await b.write('shared', value(1, [2]), null);

  assert.deepEqual([...(await a.read('shared')).bytes], [1]);
  assert.deepEqual([...(await b.read('shared')).bytes], [2]);
  assert.deepEqual(await a.exportData(), {
    format: 'akeru-guest-saves',
    version: 1,
    titleId: 'title-a',
    schemaVersion: 1,
    records: [
      {
        slot: 'shared',
        schemaVersion: 1,
        revision: (await a.read('shared')).revision,
        bytes: 'AQ==',
      },
    ],
  });
  await a.reset();
  assert.equal(await a.read('shared'), null);
  assert.deepEqual([...(await b.read('shared')).bytes], [2]);
});

test('slot and byte limits remain atomic and validation is bounded', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const options = { indexedDB: factory, databaseName };
  const a = createSaveStore(options).forTitle({
    titleId: 'quota-title',
    schemaVersion: 1,
    maxSlots: 1,
    maxBytesPerSlot: 2,
  });
  const b = createSaveStore(options).forTitle({
    titleId: 'quota-title',
    schemaVersion: 1,
    maxSlots: 1,
    maxBytesPerSlot: 2,
  });
  const results = await Promise.allSettled([
    a.write('one', value(1, [1]), null),
    b.write('two', value(1, [2]), null),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.ok(
    hasCode('quota')(
      results.find((result) => result.status === 'rejected').reason,
    ),
  );
  await assert.rejects(
    a.write('large', value(1, [1, 2, 3]), null),
    hasCode('quota'),
  );
  await assert.rejects(a.read('../other-title'), hasCode('invalid'));
  await assert.rejects(a.remove('one', 'x'.repeat(129)), hasCode('invalid'));
  assert.throws(
    () =>
      createSaveStore(options).forTitle({
        titleId: 'quota-title',
        schemaVersion: 1,
        maxSlots: Number.MAX_SAFE_INTEGER,
      }),
    hasCode('invalid'),
  );
});

test('older schemas survive reads and failed migrations preserve the record', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const oldBinding = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({ titleId: 'migrate-title', schemaVersion: 1 });
  const old = await oldBinding.write('progress', value(1, [1]), null);
  const current = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({ titleId: 'migrate-title', schemaVersion: 2 });

  assert.equal((await current.read('progress')).schemaVersion, 1);
  await assert.rejects(
    current.write('progress', value(2, [7]), old.revision),
    hasCode('migration'),
  );
  assert.deepEqual([...(await current.read('progress')).bytes], [1]);
  await assert.rejects(
    current.migrate('progress', old.revision, async (record) => {
      record.bytes[0] = 9;
      throw new Error('adapter failed');
    }),
    hasCode('migration'),
  );
  assert.deepEqual([...(await current.read('progress')).bytes], [1]);
  await assert.rejects(
    current.migrate('progress', old.revision, () => value(1, [2])),
    hasCode('migration'),
  );
  assert.deepEqual([...(await current.read('progress')).bytes], [1]);

  const migrated = await current.migrate('progress', old.revision, (record) =>
    value(2, [...record.bytes, 2]),
  );
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual([...migrated.bytes], [1, 2]);
});

test('migration cannot downgrade a record', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const current = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({
    titleId: 'no-downgrade',
    schemaVersion: 2,
  });
  const record = await current.write('progress', value(2, [2]), null);
  const oldHost = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({
    titleId: 'no-downgrade',
    schemaVersion: 1,
  });
  await assert.rejects(
    oldHost.migrate('progress', record.revision, () => value(1, [1])),
    hasCode('migration'),
  );
  assert.equal((await current.read('progress')).revision, record.revision);
});

test('migration loses safely to a concurrent write', async () => {
  const binding = makeStore().forTitle({
    titleId: 'migration-race',
    schemaVersion: 2,
  });
  // Seed an old record through a binding to the same title and database.
  const oldStore = createSaveStore({
    indexedDB: factory,
    databaseName: `akeru-saves-test-${databaseSequence}`,
  }).forTitle({ titleId: 'migration-race', schemaVersion: 1 });
  const old = await oldStore.write('progress', value(1, [1]), null);
  let release;
  const paused = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const migration = binding.migrate('progress', old.revision, async () => {
    entered();
    await paused;
    return value(2, [2]);
  });
  await started;
  const replacement = await oldStore.write(
    'progress',
    value(1, [3]),
    old.revision,
  );
  release();
  await assert.rejects(migration, hasCode('conflict'));
  assert.equal((await binding.read('progress')).revision, replacement.revision);
});

test('unavailable IndexedDB rejects persistence and reports unavailable status', async () => {
  const binding = createSaveStore({ indexedDB: undefined }).forTitle({
    titleId: 'offline-title',
    schemaVersion: 1,
  });
  assert.equal((await binding.status()).local, 'unavailable');
  await assert.rejects(binding.read('progress'), hasCode('unavailable'));
  await assert.rejects(
    binding.write('progress', value(1, [1]), null),
    hasCode('unavailable'),
  );
  await assert.rejects(binding.list(), hasCode('unavailable'));
  await assert.rejects(binding.reset(), hasCode('unavailable'));
});

test('an IndexedDB security getter cannot break store construction', async () => {
  const options = {};
  Object.defineProperty(options, 'indexedDB', {
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
  const binding = createSaveStore(options).forTitle({
    titleId: 'restricted-title',
    schemaVersion: 1,
  });
  assert.equal((await binding.status()).local, 'unavailable');
  await assert.rejects(binding.read('progress'), hasCode('unavailable'));
});

test('oversized stored records are rejected as corrupt before copying', async () => {
  const databaseName = `akeru-saves-test-${++databaseSequence}`;
  const binding = createSaveStore({
    indexedDB: factory,
    databaseName,
  }).forTitle({
    titleId: 'corrupt-title',
    schemaVersion: 1,
    maxBytesPerSlot: 2,
  });
  await binding.status();
  const request = factory.open(databaseName, 1);
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction('saves', 'readwrite');
  transaction.objectStore('saves').put({
    titleId: 'corrupt-title',
    slot: 'progress',
    schemaVersion: 1,
    revision: crypto.randomUUID(),
    bytes: new Uint8Array([1, 2, 3]),
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  await assert.rejects(binding.read('progress'), hasCode('corrupt'));
  await assert.rejects(binding.list(), hasCode('corrupt'));
});
