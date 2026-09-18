import { connectGame } from './host.js';
import { validSave } from './save.js';
let race,
  best = 0,
  lastBest = 0,
  pauseAt = 0,
  ended = false;
let soundEnabled = false;
const game = connectGame({
  validate: validSave,
  async start(s) {
    best = s?.best || 0;
    race = new window.bkcore.hexgl.HexGL({
      container: document.querySelector('#stage'),
      overlay: document.querySelector('#overlay'),
      width: Math.min(innerWidth, 1280),
      height: Math.min(innerHeight, 720),
      quality: 1,
      controlType: 0,
      hud: true,
    });
    window.akeruRace = race;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Loading timed out')),
        25000,
      );
      race.load({
        onLoad() {
          clearTimeout(timeout);
          resolve();
        },
        onError() {
          clearTimeout(timeout);
          reject(new Error('Asset unavailable'));
        },
        onProgress(p) {
          document.querySelector('#status').textContent =
            `Loading track ${p.loaded}/${p.total}`;
        },
      });
    });
    race.init();
    race.manager.setCurrent('game');
    race.initGameplay();
    race.gameplay.onFinish = function () {
      ended = true;
      if (this.result === this.results.FINISH && this.finishTime > 0) {
        best = best ? Math.min(best, this.finishTime) : this.finishTime;
        game.changed();
      }
      document.querySelector('#status').textContent =
        this.result === this.results.FINISH
          ? 'Race finished. Press Restart for another run.'
          : 'Ship destroyed. Press Restart to race again.';
    };
    document.querySelector('#status').textContent =
      'Steer: left stick / arrows · Accelerate: A / ↑ · Air brakes: B / ↓';
    requestAnimationFrame(tick);
  },
  action(a) {
    if (a === 'restart' && race?.gameplay) {
      ended = false;
      race.reset();
      document.querySelector('#status').textContent =
        'Steer: left stick / arrows · Accelerate: A / ↑';
    }
  },
  pause(value) {
    if (!race?.gameplay) return;
    if (value) {
      if (!pauseAt) pauseAt = Date.now();
      window.bkcore.Audio._ctx?.suspend();
    } else {
      const delta = pauseAt ? Date.now() - pauseAt : 0;
      race.gameplay.timer.time.start += delta;
      race.gameplay.timer.time.previous += delta;
      race.manager.time = window.perfNow();
      pauseAt = 0;
      if (soundEnabled) void window.bkcore.Audio._ctx?.resume();
    }
  },
  serialize: () => ({ best }),
  dirty() {
    const changed = best !== lastBest;
    lastBest = best;
    return changed;
  },
});
function tick() {
  if (game.active && race) {
    const h = game.held(),
      k = race.components.shipControls.key;
    k.forward = h.has('up') || h.has('confirm');
    k.left = h.has('left');
    k.right = h.has('right');
    k.ltrigger = k.rtrigger = h.has('down') || h.has('cancel');
    if (!ended) race.update();
    document.querySelector('#hud').textContent = best
      ? `Best ${(best / 1000).toFixed(2)}s`
      : '';
  }
  requestAnimationFrame(tick);
}
document.querySelector('#sound').onclick = () => {
  soundEnabled = true;
  if (game.active) void window.bkcore.Audio._ctx?.resume();
  document.querySelector('#sound').textContent = 'Sound enabled';
};
