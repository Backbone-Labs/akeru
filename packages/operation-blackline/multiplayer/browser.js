import { createMultiplayerFactory } from '../../multiplayer/src/browser.js';
import { BLACKLINE_BUILD, ROOM_NAME, validInput } from './protocol.js';
export const createBlacklineMultiplayerFactory = (config) =>
  createMultiplayerFactory({
    ...config,
    titleId: 'operation-blackline',
    build: BLACKLINE_BUILD,
    roomName: ROOM_NAME,
    validateInput: validInput,
  });

export const blacklineInputMapping = Object.freeze({
  gamepad: {
    buttons: {
      south: 'confirm',
      east: 'cancel',
      west: 'west',
      north: 'north',
      leftShoulder: 'leftShoulder',
      rightShoulder: 'rightShoulder',
      leftTrigger: 'leftTrigger',
      rightTrigger: 'rightTrigger',
      select: 'view',
      start: 'menu',
      leftStick: 'leftStick',
      rightStick: 'rightStick',
      dpadUp: 'up',
      dpadDown: 'down',
      dpadLeft: 'left',
      dpadRight: 'right',
    },
    axes: { leftX: 'moveX', leftY: 'moveY', rightX: 'lookX', rightY: 'lookY' },
  },
});
