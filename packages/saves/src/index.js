const DATABASE_VERSION = 1;
const STORE_NAME = 'saves';
const TITLE_INDEX = 'titleId';
const MAX_SLOT_COUNT = 1024;
const MAX_SLOT_BYTES = 64 * 1024 * 1024;
const titlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slotPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const revisionPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SaveError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SaveError';
    this.code = code;
  }
}

const fail = (code, message, options) => {
  throw new SaveError(code, message, options);
};

function mapStorageError(error) {
  if (error instanceof SaveError) return error;
  if (error?.name === 'QuotaExceededError')
    return new SaveError('quota', 'Local save storage quota exceeded', {
      cause: error,
    });
  return new SaveError('unavailable', 'Local save storage unavailable', {
    cause: error,
  });
}

function validateTitleId(value) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !titlePattern.test(value)
  )
    fail('invalid', 'Invalid title id');
}

function validateSlot(value) {
  if (typeof value !== 'string' || !slotPattern.test(value))
    fail('invalid', 'Invalid save slot');
}

function validateInteger(name, value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    fail('invalid', `Invalid ${name}`);
}

function validateExpectedRevision(value, nullable = false) {
  if (
    (nullable && value === null) ||
    (typeof value === 'string' && value.length > 0 && value.length <= 128)
  )
    return;
  fail('invalid', 'Invalid expected revision');
}

function cloneRecord(record) {
  return {
    schemaVersion: record.schemaVersion,
    revision: record.revision,
    bytes: new Uint8Array(record.bytes),
  };
}

function validateStoredRecord(value, titleId, slot, maxBytesPerSlot) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 5 ||
    !['titleId', 'slot', 'schemaVersion', 'revision', 'bytes'].every((key) =>
      Object.hasOwn(value, key),
    ) ||
    value.titleId !== titleId ||
    value.slot !== slot ||
    !slotPattern.test(slot) ||
    !Number.isSafeInteger(value.schemaVersion) ||
    value.schemaVersion < 1 ||
    typeof value.revision !== 'string' ||
    !revisionPattern.test(value.revision) ||
    !(value.bytes instanceof Uint8Array) ||
    value.bytes.byteLength > maxBytesPerSlot
  )
    fail('corrupt', 'Stored save record is corrupt');
  return value;
}

function validateWrite(value, schemaVersion, maxBytesPerSlot) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['schemaVersion', 'bytes'].includes(key),
    ) ||
    value.schemaVersion !== schemaVersion ||
    !(value.bytes instanceof Uint8Array)
  )
    fail('invalid', 'Invalid save');
  if (value.bytes.byteLength > maxBytesPerSlot)
    fail('quota', 'Save exceeds the per-slot byte limit');
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapStorageError(request.error));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(mapStorageError(transaction.error));
    transaction.onerror = () => {};
  });
}

function encodeBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  return globalThis.btoa(binary);
}

function createRevision() {
  try {
    const revision = globalThis.crypto?.randomUUID?.();
    if (revisionPattern.test(revision)) return revision;
  } catch {
    // Persistence cannot safely provide unique revisions in this environment.
  }
  fail('unavailable', 'Secure save revisions unavailable');
}

export function createSaveStore(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    fail('invalid', 'Invalid save store options');
  let indexedDB;
  try {
    indexedDB = Object.hasOwn(options, 'indexedDB')
      ? options.indexedDB
      : globalThis.indexedDB;
  } catch {
    indexedDB = null;
  }
  const databaseName = options.databaseName ?? 'akeru-saves-v1';
  if (
    typeof databaseName !== 'string' ||
    databaseName.length < 1 ||
    databaseName.length > 128
  )
    fail('invalid', 'Invalid database name');

  let databasePromise;
  const openDatabase = () => {
    if (!indexedDB || typeof indexedDB.open !== 'function')
      return Promise.reject(
        new SaveError('unavailable', 'Local save storage unavailable'),
      );
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(databaseName, DATABASE_VERSION);
      } catch (error) {
        reject(mapStorageError(error));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, {
              keyPath: ['titleId', 'slot'],
            });
        if (!store.indexNames.contains(TITLE_INDEX))
          store.createIndex(TITLE_INDEX, 'titleId', { unique: false });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        try {
          const transaction = database.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          if (
            JSON.stringify(store.keyPath) !==
              JSON.stringify(['titleId', 'slot']) ||
            !store.indexNames.contains(TITLE_INDEX)
          ) {
            database.close();
            reject(
              new SaveError(
                'unavailable',
                'Local save database is incompatible',
              ),
            );
            return;
          }
        } catch (error) {
          database.close();
          reject(mapStorageError(error));
          return;
        }
        resolve(database);
      };
      request.onerror = () => reject(mapStorageError(request.error));
      request.onblocked = () =>
        reject(new SaveError('unavailable', 'Local save database is blocked'));
    });
    return databasePromise;
  };

  async function runTransaction(mode, operation) {
    let transaction;
    try {
      const database = await openDatabase();
      transaction = database.transaction(STORE_NAME, mode);
      const done = transactionDone(transaction);
      try {
        const result = await operation(transaction.objectStore(STORE_NAME));
        await done;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // A failed request may already have aborted the transaction.
        }
        await done.catch(() => {});
        throw mapStorageError(error);
      }
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  function forTitle(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options))
      fail('invalid', 'Invalid title save options');
    const {
      titleId,
      schemaVersion,
      maxSlots = 16,
      maxBytesPerSlot = 1048576,
    } = options;
    validateTitleId(titleId);
    validateInteger('schema version', schemaVersion);
    validateInteger('slot limit', maxSlots, MAX_SLOT_COUNT);
    validateInteger('per-slot byte limit', maxBytesPerSlot, MAX_SLOT_BYTES);

    async function read(slot) {
      validateSlot(slot);
      return runTransaction('readonly', async (objectStore) => {
        const value = await requestResult(objectStore.get([titleId, slot]));
        return value === undefined
          ? null
          : cloneRecord(
              validateStoredRecord(value, titleId, slot, maxBytesPerSlot),
            );
      });
    }

    async function commitWrite(
      slot,
      value,
      expectedRevision,
      allowMigration = false,
    ) {
      validateSlot(slot);
      validateWrite(value, schemaVersion, maxBytesPerSlot);
      validateExpectedRevision(expectedRevision, true);
      const bytes = new Uint8Array(value.bytes);
      return runTransaction('readwrite', async (objectStore) => {
        const previous = await requestResult(objectStore.get([titleId, slot]));
        if (previous !== undefined)
          validateStoredRecord(previous, titleId, slot, maxBytesPerSlot);
        if ((previous?.revision ?? null) !== expectedRevision)
          fail('conflict', 'Save revision conflict');
        if (
          previous !== undefined &&
          previous.schemaVersion !== schemaVersion &&
          !allowMigration
        )
          fail('migration', 'Save requires explicit schema migration');
        if (
          allowMigration &&
          previous !== undefined &&
          previous.schemaVersion >= schemaVersion
        )
          fail('migration', 'Save schema migration must move forward');
        if (previous === undefined) {
          const count = await requestResult(
            objectStore.index(TITLE_INDEX).count(titleId),
          );
          if (count >= maxSlots) fail('quota', 'Save slot quota exceeded');
        }
        const stored = {
          titleId,
          slot,
          schemaVersion,
          revision: createRevision(),
          bytes,
        };
        await requestResult(objectStore.put(stored));
        return cloneRecord(stored);
      });
    }

    async function write(slot, value, expectedRevision) {
      return commitWrite(slot, value, expectedRevision);
    }

    async function remove(slot, expectedRevision) {
      validateSlot(slot);
      validateExpectedRevision(expectedRevision);
      await runTransaction('readwrite', async (objectStore) => {
        const previous = await requestResult(objectStore.get([titleId, slot]));
        if (previous !== undefined)
          validateStoredRecord(previous, titleId, slot, maxBytesPerSlot);
        if (previous?.revision !== expectedRevision)
          fail('conflict', 'Save revision conflict');
        await requestResult(objectStore.delete([titleId, slot]));
      });
    }

    async function list() {
      return runTransaction('readonly', async (objectStore) => {
        const index = objectStore.index(TITLE_INDEX);
        const count = await requestResult(index.count(titleId));
        if (count > maxSlots)
          fail('corrupt', 'Stored save slot quota is corrupt');
        const values = await requestResult(index.getAll(titleId, maxSlots + 1));
        if (values.length > maxSlots)
          fail('corrupt', 'Stored save slot quota is corrupt');
        const records = values.map((candidate) => {
          const value = validateStoredRecord(
            candidate,
            titleId,
            candidate?.slot,
            maxBytesPerSlot,
          );
          return { slot: value.slot, ...cloneRecord(value) };
        });
        records.sort((a, b) => a.slot.localeCompare(b.slot));
        return records;
      });
    }

    async function status() {
      try {
        const records = await list();
        return {
          local: 'available',
          sync: 'disabled',
          quota: {
            usedSlots: records.length,
            maxSlots,
            usedBytes: records.reduce(
              (total, record) => total + record.bytes.byteLength,
              0,
            ),
            maxBytesPerSlot,
          },
        };
      } catch (error) {
        if (mapStorageError(error).code !== 'unavailable') throw error;
        return {
          local: 'unavailable',
          sync: 'disabled',
          quota: { usedSlots: 0, maxSlots, usedBytes: 0, maxBytesPerSlot },
        };
      }
    }

    async function exportData() {
      const records = await list();
      return {
        format: 'akeru-guest-saves',
        version: 1,
        titleId,
        schemaVersion,
        records: records.map((record) => ({
          slot: record.slot,
          schemaVersion: record.schemaVersion,
          revision: record.revision,
          bytes: encodeBase64(record.bytes),
        })),
      };
    }

    async function reset() {
      await runTransaction('readwrite', async (objectStore) => {
        const keys = await requestResult(
          objectStore.index(TITLE_INDEX).getAllKeys(titleId),
        );
        await Promise.all(
          keys.map((key) => requestResult(objectStore.delete(key))),
        );
      });
    }

    async function migrate(slot, expectedRevision, migrateFn) {
      validateSlot(slot);
      validateExpectedRevision(expectedRevision);
      if (typeof migrateFn !== 'function')
        fail('invalid', 'Invalid save migration');
      const previous = await read(slot);
      if (!previous || previous.revision !== expectedRevision)
        fail('conflict', 'Save revision conflict');
      let value;
      try {
        value = await migrateFn(cloneRecord(previous));
        validateWrite(value, schemaVersion, maxBytesPerSlot);
      } catch (error) {
        if (error instanceof SaveError) {
          if (error.code === 'quota') throw error;
          if (error.code === 'invalid')
            throw new SaveError(
              'migration',
              'Save migration returned invalid data',
              {
                cause: error,
              },
            );
          throw error;
        }
        throw new SaveError('migration', 'Save migration failed', {
          cause: error,
        });
      }
      try {
        return await commitWrite(slot, value, expectedRevision, true);
      } catch (error) {
        if (error instanceof SaveError && error.code === 'conflict')
          throw error;
        throw new SaveError('migration', 'Save migration failed', {
          cause: error,
        });
      }
    }

    const service = Object.freeze({ read, write, remove, status });
    return Object.freeze({
      ...service,
      service,
      list,
      exportData,
      reset,
      migrate,
    });
  }

  return Object.freeze({ forTitle });
}
