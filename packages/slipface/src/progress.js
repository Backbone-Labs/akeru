// Slipface's progress, kept in the host's title-scoped `progress` slot.
//
// The game asks for a store with load() and save(). This is that store, with
// the rules the host's saves need: the slot is read once before the game
// starts, anything that is not exactly a good save blocks writing rather than
// being repaired over, writes carry the last revision, and a conflict or a
// failure stops further writes for the session. Existing bytes are never
// overwritten by a save the game could not read.

export const SLOT = 'progress';
export const SCHEMA_VERSION = 1;
/** Well under the host's per-slot limit; a full save is a few hundred kilobytes. */
export const MAX_BYTES = 768 * 1024;

/**
 * @param record what the host returned for the slot: {schemaVersion, bytes, revision}
 * @param readSave the game's own validator: (raw) => {save, status}
 * @returns the saved object, exactly as stored
 * @throws when the record is anything but a save this build wrote and can read back unchanged
 */
export function decodeProgress(record, readSave) {
  const bytes = record?.bytes;
  if (
    record?.schemaVersion !== SCHEMA_VERSION ||
    !(bytes instanceof Uint8Array) ||
    bytes.length === 0 ||
    bytes.length > MAX_BYTES
  )
    throw new Error('Invalid progress record');
  const state = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  );
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new Error('Invalid progress');
  // 'ok' only: 'repaired' means the game would change it, 'newer' that a later
  // build wrote it. Neither may be written over.
  if (readSave(state).status !== 'ok') throw new Error('Unreadable progress');
  return state;
}

export function encodeProgress(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (bytes.length > MAX_BYTES) throw new Error('Progress too large');
  return bytes;
}

/**
 * @param {{
 *   service: {read: Function, write: Function},
 *   readSave: Function,
 *   onBlocked?: () => void
 * }} options
 */
export function createProgress({ service, readSave, onBlocked }) {
  let revision = null;
  let loaded = null;
  let blocked = false;
  let opened = false;
  let queue = Promise.resolve();
  const block = () => {
    if (blocked) return;
    blocked = true;
    onBlocked?.();
  };
  const write = async (state) => {
    if (blocked) throw new Error('Saving unavailable');
    try {
      const result = await service.write(
        SLOT,
        { schemaVersion: SCHEMA_VERSION, bytes: encodeProgress(state) },
        revision,
      );
      if (typeof result?.revision !== 'string' || !result.revision)
        throw new Error('Invalid save result');
      revision = result.revision;
    } catch (error) {
      // Includes a revision conflict: another session wrote first, and its
      // progress is not ours to replace.
      block();
      throw error;
    }
  };
  return {
    /** Read the slot. Call once, before the game starts. Never throws. */
    async open() {
      if (opened) return;
      opened = true;
      try {
        const record = await service.read(SLOT);
        if (record !== null && record !== undefined) {
          loaded = decodeProgress(record, readSave);
          if (typeof record.revision !== 'string' || !record.revision)
            throw new Error('Invalid progress revision');
          revision = record.revision;
        }
      } catch {
        loaded = null;
        block();
      }
    },
    get blocked() {
      return blocked;
    },
    /** The store handed to the game. */
    storage: {
      load: async () => {
        if (blocked) throw new Error('Saving unavailable');
        return loaded;
      },
      /** Resolves only once the host has stored it. One write at a time, in order. */
      save(state) {
        const next = queue.then(() => write(state));
        queue = next.catch(() => {});
        return next;
      },
    },
  };
}
