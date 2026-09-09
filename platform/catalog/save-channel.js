/** The shell supplies an already title-bound service. Messages never select identity. */
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const slotValid = (s) =>
  typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(s);
const revisionValid = (r) =>
  typeof r === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(r);
const codes = new Set([
  'conflict',
  'invalid',
  'unavailable',
  'quota',
  'corrupt',
  'migration',
]);
export function createSaveChannel(service, send) {
  let pending = 0,
    disposed = false;
  return Object.freeze({
    receive(p) {
      if (
        disposed ||
        !Number.isSafeInteger(p?.requestId) ||
        p.requestId < 0 ||
        pending >= 4
      )
        return false;
      const op = p.op;
      if (!['read', 'write', 'remove', 'status'].includes(op)) return false;
      const keys =
        op === 'status'
          ? ['requestId', 'op']
          : op === 'read'
            ? ['requestId', 'op', 'slot']
            : op === 'remove'
              ? ['requestId', 'op', 'slot', 'expectedRevision']
              : ['requestId', 'op', 'slot', 'expectedRevision', 'value'];
      if (!exact(p, keys) || (op !== 'status' && !slotValid(p.slot)))
        return false;
      if (op === 'remove' && !revisionValid(p.expectedRevision)) return false;
      if (
        op === 'write' &&
        ((!revisionValid(p.expectedRevision) && p.expectedRevision !== null) ||
          !exact(p.value, ['schemaVersion', 'bytes']) ||
          !Number.isSafeInteger(p.value.schemaVersion) ||
          p.value.schemaVersion < 1 ||
          !(p.value.bytes instanceof Uint8Array) ||
          p.value.bytes.byteLength > 1048576)
      )
        return false;
      const request = structuredClone(p);
      pending++;
      Promise.resolve()
        .then(() => {
          if (disposed) return null;
          if (!service)
            throw Object.assign(new Error('Unavailable'), {
              code: 'unavailable',
            });
          if (op === 'status') return service.status();
          if (op === 'read') return service.read(request.slot);
          if (op === 'remove')
            return service.remove(request.slot, request.expectedRevision);
          return service.write(
            request.slot,
            request.value,
            request.expectedRevision,
          );
        })
        .then(
          (result) => {
            if (!disposed)
              send('save-result', {
                requestId: request.requestId,
                ok: true,
                result: result ?? null,
              });
          },
          (error) => {
            if (!disposed)
              send('save-result', {
                requestId: request.requestId,
                ok: false,
                code: codes.has(error?.code) ? error.code : 'unavailable',
              });
          },
        )
        .finally(() => pending--);
      return true;
    },
    dispose() {
      disposed = true;
    },
  });
}
