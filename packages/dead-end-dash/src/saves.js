/** The game's small documents live together in one host-owned save slot.
 * The game asks for an async key/value store; Akeru offers conditional writes
 * of bytes. Nothing here can name another title, slot owner or storage path. */
export const SLOT = 'progress';
export const SCHEMA_VERSION = 1;
/** Everything the game stores: preferences, lifetime records, a solo descent
 * as of its last huddle, and a descent it could not read and set aside. */
export const KEYS = Object.freeze([
  'settings',
  'records',
  'solo',
  'solo.unreadable',
]);
// The host allows 1 MiB a slot. A descent is a few kilobytes; anything near
// this is a fault, not progress.
export const MAX_BYTES = 262144;

const fail = (code) => Object.assign(new Error(`Save ${code}`), { code });
const plain = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export function encode(docs) {
  const out = {};
  for (const key of KEYS) if (Object.hasOwn(docs, key)) out[key] = docs[key];
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, docs: out }));
  if (bytes.byteLength > MAX_BYTES) throw fail('quota');
  return bytes;
}

/** Bytes from the host slot become documents, or an error: never a guess. */
export function decode(record) {
  if (
    !record ||
    record.schemaVersion !== SCHEMA_VERSION ||
    !(record.bytes instanceof Uint8Array) ||
    record.bytes.byteLength > MAX_BYTES
  )
    throw fail(
      record?.schemaVersion > SCHEMA_VERSION ? 'migration' : 'corrupt',
    );
  let value;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(record.bytes),
    );
  } catch {
    throw fail('corrupt');
  }
  if (
    !plain(value) ||
    Object.keys(value).length !== 2 ||
    value.v !== 1 ||
    !plain(value.docs) ||
    Object.keys(value.docs).some((key) => !KEYS.includes(key))
  )
    throw fail('corrupt');
  const docs = Object.create(null);
  for (const key of KEYS)
    if (Object.hasOwn(value.docs, key)) docs[key] = value.docs[key];
  return docs;
}

/** Read the slot once, then serve the game from memory and write changes back
 * with the last revision the host gave. A save that cannot be read, a refused
 * write or another window's newer save stops writing for this session: the
 * bytes already stored are never overwritten by something older or emptier. */
export async function openHostStore(
  service,
  { available = true, onBlocked = () => {} } = {},
) {
  let docs = Object.create(null),
    revision = null,
    blocked = null,
    dirty = false,
    writing = null;
  const block = (code) => {
    if (blocked) return;
    blocked = code;
    onBlocked(code);
  };
  if (!available) block('unavailable');
  else
    try {
      const record = await service.read(SLOT);
      if (record) {
        docs = decode(record);
        revision = record.revision;
      }
    } catch (error) {
      block(typeof error?.code === 'string' ? error.code : 'unavailable');
    }
  const clone = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  async function write() {
    try {
      const result = await service.write(
        SLOT,
        { schemaVersion: SCHEMA_VERSION, bytes: encode(docs) },
        revision,
      );
      if (typeof result?.revision !== 'string') throw fail('unavailable');
      revision = result.revision;
    } catch (error) {
      block(typeof error?.code === 'string' ? error.code : 'unavailable');
      throw fail(blocked);
    } finally {
      writing = null;
    }
  }
  function flush() {
    if (blocked) return Promise.reject(fail(blocked));
    if (writing) return writing.then(flush);
    if (!dirty) return Promise.resolve();
    dirty = false;
    writing = write();
    return writing;
  }
  const known = (key) => {
    if (!KEYS.includes(key)) throw fail('invalid');
  };
  return Object.freeze({
    /** False tells the game to say that progress will not be kept. */
    get persistent() {
      return !blocked;
    },
    get blocked() {
      return blocked;
    },
    async get(key) {
      known(key);
      return clone(docs[key]);
    },
    /** Resolves once the host has acknowledged a write containing the change.
     * When saving has stopped, the change still holds for this session, as it
     * does in the game's own memory-only store; `persistent` says which. */
    async set(key, value) {
      known(key);
      docs[key] = clone(value);
      dirty = true;
      await flush().catch(() => {});
    },
    async remove(key) {
      known(key);
      if (!Object.hasOwn(docs, key)) return;
      delete docs[key];
      dirty = true;
      await flush().catch(() => {});
    },
    /** Write anything unsaved now. Rejects, with a save error code, when
     * saving has stopped: the caller is about to tell the player. */
    flush,
  });
}
