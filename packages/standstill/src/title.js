import { connectCreator } from './bridge.js';
import { idle, input, look } from './input.js';
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./controller.css', import.meta.url).href;
document.head.append(stylesheet);
let direction = '',
  nextAt = 0;
connectCreator({
  handle: 'ss',
  keys: ['ss_save'],
  whenReady: (game) => game.bootComplete,
  idle,
  input,
  look,
  playing: (game) => Boolean(game?.playing() && !game.ui._owner()),
  ownsNavigation: true,
  touchOverlay: (game) => Boolean(game?.playing() && !game.ui._owner()),
  routeInput({ buttons: b, axes: a }, previous, game) {
    const owner = game.ui._owner();
    const pressed = (k) => b[k] > 0.5 && !(previous[k] > 0.5);
    if (!owner) {
      if (pressed('cancel') && game.inLevel()) {
        game.akeruPending = {};
        game.setPaused(true);
        return true;
      }
      // Keep short touch taps until the next game frame consumes them.
      // A down/up pair may arrive between two rendering frames.
      if (game.playing()) {
        const pending = (game.akeruPending ??= {});
        pending.jump ||= pressed('confirm');
        pending.fire ||= pressed('rightTrigger');
        pending.grab ||= pressed('west');
        pending.throw ||= pressed('leftTrigger') || pressed('north');
      }
      return false;
    }
    const key = (code) =>
      owner.key(
        new KeyboardEvent('keydown', { code, key: code, bubbles: true }),
      );
    if (pressed('cancel')) key('Escape');
    else if (pressed('confirm')) key('Enter');
    else if (pressed('rightShoulder') && owner.step) owner.step(1);
    else if (pressed('leftShoulder') && owner.step) owner.step(-1);
    else {
      const x = a.moveX || (b.right || 0) - (b.left || 0);
      const y = a.moveY || (b.down || 0) - (b.up || 0);
      const d =
        Math.abs(y) > 0.5
          ? y > 0
            ? 'ArrowDown'
            : 'ArrowUp'
          : Math.abs(x) > 0.5
            ? x > 0
              ? 'ArrowRight'
              : 'ArrowLeft'
            : '';
      const now = performance.now();
      if (d && (d !== direction || now >= nextAt)) {
        key(d);
        nextAt = now + (d === direction ? 180 : 400);
      }
      direction = d;
    }
    return true;
  },
  clear(game) {
    direction = '';
    nextAt = 0;
    if (!game) return;
    game.akeruActions = {};
    game.akeruPending = {};
    game.input.dx = game.input.dy = 0;
    game.input.lmb = game.input.rmbEdge = false;
  },
  setup(game) {
    game.ui.lockHint = false;
    game.canvas.addEventListener('pointermove', (e) => {
      if (game.playing() && e.buttons) {
        game.input.dx += e.movementX;
        game.input.dy += e.movementY;
      }
    });
    game.canvas.addEventListener('pointerdown', (e) => {
      if (!game.playing()) return;
      if (e.button === 0) game.input.lmb = true;
      if (e.button === 2) game.input.rmbEdge = true;
    });
  },
});
