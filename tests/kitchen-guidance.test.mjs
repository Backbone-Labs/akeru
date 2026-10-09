import test from 'node:test';
import assert from 'node:assert/strict';
import {
  soupGuidance,
  stationHint,
} from '../packages/mythic-kitchen/src/kitchen-guidance.js';
const onion = { kind: 'ingredient', type: 'onion', state: 'chopped' };
function kitchen() {
  const player = { id: 'p1', held: null };
  const pot = {
    type: 'stove',
    x: 8,
    y: 2,
    item: { kind: 'pot', state: 'empty', progress: 0, contents: [] },
  };
  const state = {
    players: [player],
    tiles: [
      pot,
      { type: 'crate', ingredient: 'onion' },
      { type: 'cutting', item: null },
      { type: 'plates', count: 4 },
      { type: 'delivery' },
      { type: 'counter', item: null },
      { type: 'sink', dirty: 0, clean: 0 },
    ],
  };
  return {
    player,
    pot,
    state,
    guide: () => soupGuidance(state, player, 'castle-1'),
  };
}
test('onion guide explains the complete recipe, including the plate and serving steps', () => {
  const { player, pot, state, guide } = kitchen();
  assert.equal(guide().step, 1);
  player.held = { ...onion, state: 'raw' };
  assert.equal(guide().step, 2);
  player.held = onion;
  assert.equal(guide().step, 3);
  pot.item.contents = [onion, onion];
  assert.match(guide().title, /2\/3/);
  player.held = null;
  assert.match(guide().title, /1 more/);
  pot.item.contents.push(onion);
  pot.item.state = 'cooking';
  pot.item.progress = 0.5;
  assert.equal(guide().step, 4);
  assert.match(guide().detail, /5s.*clean plate/);
  pot.item.state = 'cooked';
  assert.equal(guide().step, 5);
  assert.equal(guide().target.type, 'plates');
  player.held = { kind: 'plate', dirty: false, contents: [] };
  assert.equal(guide().target, pot);
  assert.match(guide().detail, /press \{A\} to fill/);
  player.held.contents.push({ kind: 'soup', type: 'onion' });
  assert.equal(guide().step, 6);
  assert.equal(guide().target.type, 'delivery');
  assert.equal(soupGuidance(state, player, 'castle-2'), null);
});
test('guide counts one pot, handles lifted pots, fire and dirty plates instead of advancing blindly', () => {
  const { state, pot, player, guide } = kitchen();
  pot.item.contents = [onion];
  state.tiles.push({
    type: 'stove',
    item: { kind: 'pot', state: 'empty', contents: [onion, onion] },
  });
  assert.match(guide().title, /1 more/);
  player.held = pot.item;
  assert.match(guide().title, /stove/);
  player.held = { kind: 'plate', dirty: true, contents: [] };
  assert.match(guide().title, /Wash/);
  pot.onFire = true;
  assert.equal(guide().step, '!');
  assert.match(guide().detail, /extinguisher/);
});
test('hold prompts require an actual actionable station and free hands', () => {
  const player = { held: null };
  const board = { type: 'cutting', item: { ...onion, state: 'raw' } };
  assert.equal(stationHint(board, player), 'Hold {X} · Chop');
  player.held = onion;
  assert.notEqual(stationHint(board, player), 'Hold {X} · Chop');
  player.held = null;
  board.item.state = 'chopped';
  assert.equal(stationHint(board, player), '{A} · Pick up');
  assert.equal(
    stationHint({ type: 'sink', dirty: 1 }, player),
    'Hold {X} · Wash',
  );
  assert.equal(stationHint({ type: 'sink', dirty: 0 }, player), null);
  assert.equal(
    stationHint(
      { type: 'stove', item: { kind: 'pot', state: 'cooking' } },
      player,
    ),
    'Cooking… get a clean plate',
  );
});
