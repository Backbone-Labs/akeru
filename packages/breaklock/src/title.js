import { connectGame } from './host.js';
import { validSave } from './save.js';
let secret,
  current,
  history = [],
  wins = 0,
  cursor = 0,
  won = false;
const board = document.querySelector('#board'),
  log = document.querySelector('#history');
const make = (a) => {
  const p = new window.Pattern(4);
  p.suite = a.slice();
  return p;
};
const game = connectGame({
  validate: validSave,
  start(s) {
    secret = new window.Pattern(4);
    secret.fillRandomly();
    current = new window.Pattern(4);
    if (s) {
      secret = make(s.secret);
      current = make(s.current);
      history = s.history;
      wins = s.wins;
      won = history.some((p) => secret.compare(make(p))[0] === 4);
    }
    render();
  },
  action(a) {
    if (a === 'restart') {
      secret = new window.Pattern(4);
      secret.fillRandomly();
      current.reset();
      history = [];
      won = false;
    } else if (a === 'cancel') current.reset();
    else if (a === 'confirm') choose(cursor);
    else {
      const d = { left: -1, right: 1, up: -3, down: 3 }[a];
      if (d) cursor = (cursor + d + 9) % 9;
    }
    render();
  },
  serialize: () => ({
    secret: secret.suite,
    current: current.suite,
    history,
    wins,
  }),
});
function choose(n) {
  if (won || history.length >= 100) return;
  current.addDot(n);
  if (current.isComplete()) {
    history.push(current.suite.slice());
    if (secret.compare(current)[0] === 4) {
      won = true;
      wins++;
    }
    current.reset();
  }
  game.changed();
  render();
}
for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.className = 'dot';
  b.textContent = i + 1;
  b.setAttribute('aria-label', 'Dot ' + (i + 1));
  b.onclick = () => {
    cursor = i;
    choose(i);
  };
  board.append(b);
}
function render() {
  board.querySelectorAll('button').forEach((b, i) => {
    b.classList.toggle('selected', current.suite.includes(i));
    b.classList.toggle('cursor', i === cursor);
    b.setAttribute('aria-pressed', String(current.suite.includes(i)));
  });
  document.querySelector('#status').textContent = won
    ? 'Unlocked! Start a new lock to play again.'
    : 'Find the hidden 4-dot pattern. Filled = right position; hollow = right dot, wrong position.';
  document.querySelector('#selection').textContent =
    'Pattern: ' +
    (current.suite.map((n) => n + 1).join(' → ') || 'Choose four dots');
  document.querySelector('#hud').textContent = `${wins} solved`;
  log.replaceChildren();
  for (const guess of history.slice(-8).reverse()) {
    const feedback = secret.compare(make(guess)),
      row = document.createElement('li');
    row.textContent =
      guess.map((n) => n + 1).join('–') +
      '  ' +
      '●'.repeat(feedback[0]) +
      '○'.repeat(feedback[1]) +
      ' · ' +
      feedback[2] +
      ' incorrect';
    log.append(row);
  }
}
