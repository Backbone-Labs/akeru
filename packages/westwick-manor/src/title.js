import { connectCreator } from './bridge.js';
import { idle, input } from './input.js';
connectCreator({
  handle: 'ww',
  keys: ['ww_meta', 'ww_save'],
  idle,
  input,
  beforeSave(game) {
    if (game?.mode === 'solo') game.saveSolo();
  },
  action({ buttons: b }, old, game) {
    if (b.view > 0.5 && !(old.view > 0.5)) game.ui.showMap(!game.ui._mapOpen);
    for (const [key, delta] of [
      ['leftShoulder', -1],
      ['rightShoulder', 1],
    ])
      if (b[key] > 0.5 && !(old[key] > 0.5))
        game.input.slot =
          ((['candle', 'salt', 'holy_water'].indexOf(game.me()?.selected) +
            delta +
            3) %
            3) +
          1;
  },
  setup(game) {
    addEventListener('pointermove', () => {
      game.akeruAim = null;
    });
    const hint = document.createElement('p');
    hint.className = 'akeru-controller-hint';
    hint.textContent =
      'Move: left stick · Aim: right stick · RT/X strike · LT ability · A interact · B dash · Y item · Menu pause';
    document.body.append(hint);
  },
});
