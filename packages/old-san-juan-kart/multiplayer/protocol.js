import {
  exact,
  validRequest as roomRequest,
} from '../../multiplayer/src/protocol.js';
export const KART_BUILD = 'kart-f8468fec-v1';
export const ROOM_NAME = 'old-san-juan-kart-v1';
export const neutral = () => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
});
export function validInput(v) {
  return (
    exact(v, ['seq', 'throttle', 'brake', 'steer', 'drift']) &&
    Number.isSafeInteger(v.seq) &&
    v.seq >= 0 &&
    ['throttle', 'brake', 'steer'].every(
      (k) =>
        Number.isFinite(v[k]) && v[k] >= (k === 'steer' ? -1 : 0) && v[k] <= 1,
    ) &&
    typeof v.drift === 'boolean'
  );
}

export const validRequest = (v) => roomRequest(v, validInput);
