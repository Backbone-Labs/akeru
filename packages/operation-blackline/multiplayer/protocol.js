import {
  exact,
  validRequest as roomRequest,
} from '../../multiplayer/src/protocol.js';
export const BLACKLINE_BUILD = 'blackline-8533717e-v2';
export const ROOM_NAME = 'operation-blackline-v1';
export const neutral = (yaw = 0, pitch = 0, weapon = 0) => ({
  moveX: 0,
  moveY: 0,
  yaw,
  pitch,
  weapon,
  jump: false,
  crouch: false,
  sprint: false,
  fire: false,
  reload: false,
});
export function validInput(v) {
  return (
    exact(v, [
      'seq',
      'moveX',
      'moveY',
      'yaw',
      'pitch',
      'weapon',
      'jump',
      'crouch',
      'sprint',
      'fire',
      'reload',
    ]) &&
    Number.isSafeInteger(v.seq) &&
    v.seq >= 0 &&
    ['moveX', 'moveY'].every(
      (k) => Number.isFinite(v[k]) && Math.abs(v[k]) <= 1,
    ) &&
    Number.isFinite(v.yaw) &&
    Math.abs(v.yaw) <= Math.PI &&
    Number.isFinite(v.pitch) &&
    Math.abs(v.pitch) <= 1.51 &&
    Number.isInteger(v.weapon) &&
    v.weapon >= 0 &&
    v.weapon <= 2 &&
    ['jump', 'crouch', 'sprint', 'fire', 'reload'].every(
      (k) => typeof v[k] === 'boolean',
    )
  );
}
export const validRequest = (v) => roomRequest(v, validInput);
