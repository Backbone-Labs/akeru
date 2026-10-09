import { connectCreator } from './bridge.js';
import { idle, input } from './input.js';
connectCreator({
  handle: 'mk',
  keys: [
    'mk_name',
    'mk_character',
    'mk_progress',
    'mk_best',
    'mk_sound',
    'mk_tutorial_seen',
  ],
  idle,
  input,
  pill: true,
  restart(game) {
    if (!game.level || !game.inGame()) return false;
    game.restart();
    return true;
  },
  audioChanged(game, enabled) {
    game.ui._soundOn = enabled;
    globalThis.akeruCreator.storage.setItem('mk_sound', enabled ? '1' : '0');
  },
});
