import { connectGame } from './host.js';
import { validSave } from './save.js';
let last = 0,
  elapsed = 0;
const game = connectGame({
  validate: validSave,
  start(state) {
    window.renderer = new window.THREE.WebGLRenderer({ antialias: true });
    window.renderer.setSize(innerWidth, innerHeight);
    document.querySelector('#stage').append(window.renderer.domElement);
    window.gameState = 'initialize';
    window.mazeDimension = state?.dimension || 11;
    window.gameLoop();
    if (state) {
      window.maze = state.maze;
      window.maze.dimension = state.dimension;
      window.createPhysicsWorld();
      window.createRenderWorld();
      window.wBall.SetPosition(new window.b2Vec2(state.x, state.y));
    }
    document.querySelector('#status').textContent =
      'Find the exit · Move: arrows / WASD / left stick';
    requestAnimationFrame(tick);
  },
  action(a) {
    if (a === 'restart') {
      window.mazeDimension = 11;
      window.gameState = 'initialize';
    }
  },
  serialize() {
    const p = window.wBall.GetPosition();
    return {
      dimension: window.maze.dimension,
      maze: window.maze.map((r) => r.slice()),
      x: p.x,
      y: p.y,
    };
  },
  dirty: () => game.active,
});
function tick(t) {
  elapsed += Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (game.active) {
    const h = game.held();
    while (elapsed >= 1 / 60) {
      window.keyAxis = [
        Number(h.has('right')) - Number(h.has('left')),
        Number(h.has('up')) - Number(h.has('down')),
      ];
      window.gameLoop();
      elapsed -= 1 / 60;
    }
  } else elapsed = 0;
  requestAnimationFrame(tick);
}
addEventListener('resize', () => {
  if (window.camera) window.onResize();
});
