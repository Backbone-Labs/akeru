import { connectGame } from './host.js';
import { validSave } from './save.js';
// Original procedural artwork. No upstream OutRun sprites or licensed music.
function artwork() {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  for (const [name, s] of Object.entries(window.SPRITES)) {
    if (!s || typeof s.x !== 'number') continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (/CAR|PLAYER|TRUCK|SEMI/.test(name)) {
      ctx.fillStyle = '#10141b';
      ctx.fillRect(0, s.h * 0.35, s.w, s.h * 0.65);
      ctx.fillStyle = name.startsWith('PLAYER') ? '#ff6939' : '#40bad1';
      ctx.fillRect(s.w * 0.08, s.h * 0.3, s.w * 0.84, s.h * 0.65);
      ctx.beginPath();
      ctx.moveTo(s.w * 0.15, s.h * 0.4);
      ctx.lineTo(s.w * 0.28, 0);
      ctx.lineTo(s.w * 0.72, 0);
      ctx.lineTo(s.w * 0.85, s.h * 0.4);
      ctx.fill();
      ctx.fillStyle = '#142b45';
      ctx.fillRect(s.w * 0.29, s.h * 0.07, s.w * 0.42, s.h * 0.3);
      ctx.fillStyle = '#fff0bb';
      ctx.fillRect(s.w * 0.12, s.h * 0.69, s.w * 0.18, s.h * 0.12);
      ctx.fillRect(s.w * 0.7, s.h * 0.69, s.w * 0.18, s.h * 0.12);
    } else if (name.startsWith('BILLBOARD')) {
      ctx.fillStyle = '#36333d';
      ctx.fillRect(s.w * 0.15, 0, s.w * 0.7, s.h * 0.6);
      ctx.fillRect(s.w * 0.46, s.h * 0.6, s.w * 0.08, s.h * 0.4);
      ctx.fillStyle = '#ff8f56';
      ctx.font = `bold ${Math.round(s.h * 0.17)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('RACE', s.w * 0.5, s.h * 0.37);
    } else {
      ctx.fillStyle = '#85675a';
      ctx.fillRect(s.w * 0.44, s.h * 0.3, s.w * 0.12, s.h * 0.7);
      ctx.fillStyle = '#3c8b7c';
      ctx.beginPath();
      ctx.moveTo(s.w * 0.5, 0);
      ctx.lineTo(s.w, s.h * 0.72);
      ctx.lineTo(0, s.h * 0.72);
      ctx.fill();
    }
    ctx.restore();
  }
  window.sprites = canvas;
  const bg = document.createElement('canvas');
  bg.width = 1290;
  bg.height = 1470;
  const c = bg.getContext('2d');
  for (const [i, color] of ['#a6b4c3', '#75bfdc', '#708e9d'].entries()) {
    c.fillStyle = color;
    c.fillRect(0, i * 490, 1290, 490);
  }
  c.fillStyle = '#8ba4b3';
  for (let i = 0; i < 12; i++) {
    c.beginPath();
    c.moveTo(i * 130, 480);
    c.lineTo(i * 130 + 100, 180 + (i % 3) * 40);
    c.lineTo(i * 130 + 210, 480);
    c.fill();
  }
  window.background = bg;
}
let best = 0,
  previous = 0,
  last = 0;
const game = connectGame({
  validate: validSave,
  start(state) {
    best = state?.best || 0;
    window.Dom.storage.fast_lap_time = best || 86400;
    artwork();
    window.reset({ width: 960, height: 540, drawDistance: 180 });
    window.updateHud('fast_lap_time', best ? window.formatTime(best) : '—');
    document.querySelector('#status').textContent =
      'Steer: arrows / WASD / left stick · Accelerate: ↑ / A · Brake: ↓ / B';
    requestAnimationFrame(tick);
  },
  action(a) {
    if (a === 'restart') {
      window.position = 0;
      window.speed = 0;
      window.playerX = 0;
      window.currentLapTime = 0;
    }
  },
  serialize: () => ({ best }),
  dirty: () => {
    const changed = best !== previous;
    previous = best;
    return changed;
  },
});
function tick(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (game.active) {
    const h = game.held();
    window.keyLeft = h.has('left');
    window.keyRight = h.has('right');
    window.keyFaster = h.has('up') || h.has('confirm');
    window.keySlower = h.has('down') || h.has('cancel');
    window.update(dt);
    window.render();
    const value = Number(window.Dom.storage.fast_lap_time);
    if (value > 0 && value < 86400) best = value;
  }
  requestAnimationFrame(tick);
}
