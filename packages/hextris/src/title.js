import { validSave } from './save.js';
import { connectGame } from './host.js';
const canvas = document.querySelector('canvas');
let ready = false,
  paused = false,
  best = 0,
  lastBest = 0;
Object.assign(window, {
  canvas,
  ctx: canvas.getContext('2d'),
  trueCanvas: { width: 800, height: 680 },
  colors: ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'],
  settings: {
    platform: 'nonmobile',
    scale: 1,
    prevScale: 1,
    baseScale: 1,
    hexWidth: 65,
    baseHexWidth: 65,
    blockHeight: 18,
    baseBlockHeight: 18,
    rows: 8,
    startDist: 315,
    creationDt: 9,
    speedModifier: 0.65,
    creationSpeedModifier: 0.65,
    comboTime: 310,
  },
  angularVelocityConst: 4,
  score: 0,
  scoreAdditionCoeff: 1,
  gdx: 0,
  gdy: 0,
  gameState: 1,
  blocks: [],
  importing: 0,
  importedHistory: undefined,
  startTime: Date.now(),
  hexagonBackgroundColor: '#101214',
  hexagonBackgroundColorClear: '#101214',
  centerBlue: '#eee',
  hexColorsToTintedColors: {},
  rgbToHex: {},
  rgbColorsToTintedColors: {},
});
window.addNewBlock = (lane, color, iter, dist, settled) =>
  window.blocks.push(
    new window.Block(
      lane,
      color,
      iter * window.settings.speedModifier,
      dist,
      settled,
    ),
  );
function restart() {
  window.score = 0;
  window.gdx = 0;
  window.gdy = 0;
  window.blocks = [];
  window.gameState = 1;
  window.MainHex = new window.Hex(window.settings.hexWidth);
  window.waveone = new window.waveGen(window.MainHex);
  document.querySelector('#status').textContent =
    'Match 3 colors · ← → / A D · click either side';
}
const action = connectGame({
  validate: validSave,
  start(state) {
    best =
      Number.isSafeInteger(state?.best) && state.best >= 0 ? state.best : 0;
    restart();
    ready = true;
  },
  action(a) {
    if (a === 'restart' || (a === 'confirm' && window.gameState === 2))
      restart();
    else if (window.gameState === 1) {
      if (a === 'left') window.MainHex.rotate(1);
      if (a === 'right') window.MainHex.rotate(-1);
    }
  },
  pause(value) {
    paused = value;
  },
  serialize() {
    return { best };
  },
  dirty() {
    const changed = best !== lastBest;
    lastBest = best;
    return changed;
  },
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  action(
    e.clientX < canvas.getBoundingClientRect().left + canvas.clientWidth / 2
      ? 'left'
      : 'right',
  );
});
let previous = performance.now();
function frame(at) {
  const dt = Math.min(2, (at - previous) / 16.6667);
  previous = at;
  if (ready && !paused) {
    const { ctx, MainHex, settings } = window;
    ctx.clearRect(0, 0, 800, 680);
    window.drawPolygon(
      400,
      340,
      6,
      (settings.rows * settings.blockHeight * 2) / Math.sqrt(3) +
        settings.hexWidth,
      30,
      '#15191e',
      2,
      '#454951',
    );
    if (window.gameState === 1) window.update(dt);
    for (const lane of MainHex.blocks)
      for (let j = 0; j < lane.length; j++) lane[j].draw(true, j);
    for (const b of window.blocks) b.draw();
    MainHex.draw();
    for (let i = MainHex.texts.length - 1; i >= 0; i--)
      if (!MainHex.texts[i].draw()) MainHex.texts.splice(i, 1);
    if (
      MainHex.blocks.some(
        (lane) => lane.filter((b) => !b.deleted).length > settings.rows,
      )
    ) {
      window.gameState = 2;
      document.querySelector('#status').textContent =
        'Game over · New game or Enter to retry';
    }
    best = Math.max(best, window.score);
    document.querySelector('#score').textContent =
      `Score ${window.score} · Best ${best}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
