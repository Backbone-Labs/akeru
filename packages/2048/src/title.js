import { validSave } from './save.js';
import { connectGame } from './host.js';
let manager,
  snapshot = null,
  best = 0;
class Input {
  on() {}
}
class Storage {
  getGameState() {
    return snapshot;
  }
  getBestScore() {
    return best;
  }
  setBestScore(v) {
    best = v;
  }
  setGameState(v) {
    snapshot = v;
  }
  clearGameState() {
    snapshot = null;
  }
}
class Actuator {
  continueGame() {}
  actuate(grid, m) {
    const board = document.querySelector('#board');
    board.replaceChildren();
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const tile = document.createElement('div'),
          v = grid.cells[x][y]?.value;
        tile.className = 'tile';
        tile.dataset.value = v || 0;
        tile.textContent = v || '';
        board.append(tile);
      }
    document.querySelector('#score').textContent = m.score;
    document.querySelector('#status').textContent = m.over
      ? 'Game over. Start a new game.'
      : m.won && !m.keepPlaying
        ? '2048! Select Continue to keep playing.'
        : 'Arrow keys / WASD · Swipe · D-pad';
  }
}
const action = connectGame({
  validate: validSave,
  start(state) {
    if (state) snapshot = state;
    manager = new window.GameManager(4, Input, Actuator, Storage);
  },
  action(a) {
    if (a === 'restart') manager.restart();
    else if (a === 'confirm' && manager.won) {
      manager.keepPlaying = true;
      manager.actuate();
    } else {
      const d = ['up', 'right', 'down', 'left'].indexOf(a);
      if (d >= 0) manager.move(d);
    }
  },
  serialize() {
    return snapshot;
  },
});
let touch;
const board = document.querySelector('#board');
board.addEventListener('pointerdown', (e) => {
  touch = [e.clientX, e.clientY];
  board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const x = e.clientX - touch[0],
    y = e.clientY - touch[1];
  touch = null;
  if (Math.max(Math.abs(x), Math.abs(y)) > 20)
    action(
      Math.abs(x) > Math.abs(y)
        ? x > 0
          ? 'right'
          : 'left'
        : y > 0
          ? 'down'
          : 'up',
    );
});
