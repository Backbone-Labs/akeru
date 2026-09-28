import { createMultiplayerFactory } from '../../multiplayer/src/browser.js';
import { KART_BUILD, ROOM_NAME, validInput } from './protocol.js';
export const createKartMultiplayerFactory = (config) =>
  createMultiplayerFactory({
    ...config,
    titleId: 'old-san-juan-kart',
    build: KART_BUILD,
    roomName: ROOM_NAME,
    validateInput: validInput,
  });
