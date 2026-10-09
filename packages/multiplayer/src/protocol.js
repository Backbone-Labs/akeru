/** Versioned host-owned room interface. Games can send inputs, never positions or URLs. */
export const CAPABILITY = 'multiplayer.rooms.v1';
export const exact = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export const validRoom = (v) =>
  typeof v === 'string' && /^[a-f0-9]{20}$/.test(v);
export function validRequest(v, validateInput = () => false) {
  if (!v || typeof v !== 'object') return false;
  if (['create', 'start', 'rematch', 'leave', 'resume'].includes(v.action))
    return exact(v, ['action']);
  if (v.action === 'join')
    return exact(v, ['action', 'code']) && validRoom(v.code);
  if (v.action === 'ready')
    return exact(v, ['action', 'ready']) && typeof v.ready === 'boolean';
  if (v.action === 'input')
    return exact(v, ['action', 'input']) && validateInput(v.input);
  return false;
}
