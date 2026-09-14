import { connectGame } from './host.js';
import { validSave } from './save.js';
import {
  getInitialPairs,
  initTileDb,
  isFree,
  selectTile,
  getAvailablePairs,
  getCard,
  getMap,
  mapGet,
  gameOverCondition,
} from './engine-game.js';
import { setupTiles } from './engine-setupTiles.js';
import Random from './adapter.js';
const board = document.querySelector('#board');
let db,
  game,
  cursor,
  hint = [],
  paused = false;
function fresh() {
  const deck = getInitialPairs().map(([card], i) => ({
    id: String(i),
    cardId: card.id,
    material: 'bone',
  }));
  db = initTileDb(setupTiles({ rng: new Random(), deck }));
  game = { points: 0, coins: 0, time: 0, pause: false };
  cursor = null;
  hint = [];
}
function free() {
  return db.all
    .filter((t) => isFree(db, t, game))
    .sort((a, b) => a.y - b.y || a.x - b.x || b.z - a.z);
}
function render() {
  const available = free();
  if (!available.some((t) => t.id === cursor)) cursor = available[0]?.id;
  board.replaceChildren();
  for (const tile of db.all
    .filter((t) => !t.deleted)
    .sort((a, b) => a.z - b.z || a.y - b.y)) {
    const el = document.createElement('button'),
      card = getCard(tile.cardId),
      enabled = isFree(db, tile, game);
    el.className = [
      'tile',
      tile.id === cursor ? 'focused' : '',
      tile.selected ? 'selected' : '',
      hint.includes(tile.id) ? 'hint' : '',
    ].join(' ');
    el.dataset.id = tile.id;
    el.dataset.card = tile.cardId;
    el.dataset.suit = card.suit;
    el.setAttribute('aria-disabled', String(!enabled));
    el.setAttribute('aria-pressed', String(tile.selected));
    el.setAttribute(
      'aria-label',
      `${card.suit} ${card.rank}${enabled ? '' : ' — blocked'}`,
    );
    el.tabIndex = enabled ? 0 : -1;
    el.style.left = `${tile.x * 6.08 - tile.z * 0.8}%`;
    el.style.top = `${tile.y * 5.87 - tile.z * 1.25}%`;
    el.style.zIndex = String(tile.z * 100 + tile.y);
    const rank = document.createElement('span'),
      suit = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = card.rank;
    suit.className = 'suit';
    suit.textContent = { bam: 'BAM', crack: 'CHAR', dot: 'DOT' }[card.suit];
    el.append(rank, suit);
    el.addEventListener('click', () => action(`tile:${tile.id}`));
    board.append(el);
  }
  const remaining = db.all.filter((t) => !t.deleted).length,
    pairs = getAvailablePairs(db, game).length;
  document.querySelector('#score').textContent = game.points;
  document.querySelector('#remaining').textContent = `${remaining} tiles`;
  document.querySelector('#pairs').textContent = `${pairs} available pairs`;
  document.querySelector('#status').textContent = paused
    ? 'Paused'
    : remaining === 0
      ? 'Board cleared. Beautifully done.'
      : pairs === 0
        ? 'No pairs remain. Try a new board.'
        : 'Match tiles with an open left or right edge and nothing above.';
}
function move(direction) {
  const tiles = free(),
    current = db.get(cursor);
  if (!current) return;
  const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[
    direction
  ];
  const candidates = tiles.filter(
    (t) => (t.x - current.x) * dx + (t.y - current.y) * dy > 0,
  );
  candidates.sort((a, b) => {
    const score = (t) =>
      Math.hypot(t.x - current.x, t.y - current.y) +
      Math.abs((t.x - current.x) * dy - (t.y - current.y) * dx) * 3;
    return score(a) - score(b);
  });
  if (candidates[0]) cursor = candidates[0].id;
}
const action = connectGame({
  validate(state) {
    if (!validSave(state)) return false;
    const map = getMap(54);
    if (
      !state.tiles.every(
        (t) =>
          mapGet(map, t.x, t.y, t.z) === t.id &&
          mapGet(map, t.x - 1, t.y, t.z) !== t.id &&
          mapGet(map, t.x, t.y - 1, t.z) !== t.id,
      )
    )
      return false;
    for (const card of getInitialPairs().map(([card]) => card.id))
      if (state.tiles.filter((t) => t.cardId === card && t.deleted).length % 2)
        return false;
    if (
      state.points !==
      state.tiles
        .filter((t) => t.deleted)
        .reduce((sum, t) => sum + getCard(t.cardId).points, 0)
    )
      return false;
    const check = initTileDb(
      Object.fromEntries(state.tiles.map((t) => [t.id, t])),
    );
    return state.tiles.every((t) => !t.selected || isFree(check, t));
  },
  start(state) {
    fresh();
    if (state) {
      db = initTileDb(Object.fromEntries(state.tiles.map((t) => [t.id, t])));
      game.points = state.points;
      game.endCondition = gameOverCondition(db, game);
    }
    render();
  },
  action(a) {
    if (a === 'restart' || (a === 'confirm' && game.endCondition)) {
      fresh();
      render();
      return;
    }
    if (a === 'hint' || a === 'cancel') {
      hint = getAvailablePairs(db, game)[0]?.map((t) => t.id) || [];
      render();
      return;
    }
    hint = [];
    if (['left', 'right', 'up', 'down'].includes(a)) move(a);
    else if (a === 'confirm' || a === 'primary' || a.startsWith('tile:')) {
      const id = a.startsWith('tile:') ? a.slice(5) : cursor,
        tile = db.get(id);
      if (tile && isFree(db, tile, game) && !game.endCondition) {
        cursor = id;
        selectTile({ tileDb: db, game, tileId: id });
      }
    }
    render();
  },
  serialize() {
    return {
      version: 1,
      points: game.points,
      tiles: db.all.map(
        ({ id, cardId, material, x, y, z, selected, deleted }) => ({
          id,
          cardId,
          material,
          x,
          y,
          z,
          selected,
          deleted,
        }),
      ),
    };
  },
  pause(value) {
    paused = value;
    if (db) render();
  },
});
