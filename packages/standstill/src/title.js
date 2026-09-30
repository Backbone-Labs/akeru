import { connectCreator } from './bridge.js';
import { idle, input, look } from './input.js';
import { installControlHints } from './control-hints.js';
const hints = installControlHints(document.querySelector('#ui-root'));
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
  pill: true,
  restart(game) {
    if (!game.level) return false;
    game.retry();
    return true;
  },
  idle,
  input,
  look,
  playing: (game) => Boolean(game?.playing() && !game.ui._owner()),
  ownsNavigation: true,
  touchOverlay: (game) => Boolean(game?.playing() && !game.ui._owner()),
  routeInput({ buttons: b, axes: a }, previous, game) {
    if (
      Object.values(b).some((value) => value > 0.25) ||
      Object.values(a).some((value) => Math.abs(value) > 0.25)
    ) {
      hints.set('controller');
      game.ui.lockHint = false;
    }
    const owner = game.ui._owner();
    const pressed = (k) => b[k] > 0.5 && !(previous[k] > 0.5);
    if (!owner && game.mode === 'replay' && pressed('confirm')) {
      game.input.pressed.add('Space');
      return true;
    }
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
        pending.fire ||=
          (b.rightTrigger > 0.25 && !(previous.rightTrigger > 0.25)) ||
          pressed('rightShoulder');
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
    else if (pressed('confirm'))
      key(game.mode === 'replay' ? 'Space' : 'Enter');
    else if (pressed('west')) key('KeyR');
    else if (pressed('north')) key('KeyL');
    else if (pressed('leftShoulder') && !owner.step) key('Delete');
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
    if (
      globalThis.akeruCreator.paused &&
      document.pointerLockElement === game.canvas
    )
      document.exitPointerLock?.();
    game.akeruActions = {};
    game.akeruPending = {};
    game.input.dx = game.input.dy = 0;
    game.input.lmb = game.input.rmbEdge = false;
  },
  setup(game) {
    game.ui.lockHint = false;
    addEventListener('keydown', (event) => {
      if (event.isTrusted) hints.set('keyboard');
    });
    addEventListener('pointerdown', (event) => {
      if (event.isTrusted && event.pointerType === 'mouse')
        hints.set('keyboard');
    });
    game.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') game.ui.lockHint = true;
    });
  },
});
