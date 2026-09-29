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
  setup() {
    const hint = document.createElement('p');
    hint.className = 'akeru-controller-hint';
    hint.textContent =
      'Move: left stick / D-pad · A pick up / put down · Hold X / RT chop / wash · B dash · Y switch chef · Menu pause';
    document.body.append(hint);
  },
});
