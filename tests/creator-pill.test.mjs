import test from 'node:test';
import assert from 'node:assert/strict';
import { createPill } from '../packages/creator-preview/pill.js';
function fixture(extra = {}) {
  const replies = [];
  let writes = 0;
  const game = {
    mode: 'single',
    sfx: {
      enabled: true,
      ctx: { state: 'running' },
      setEnabled(value) {
        this.enabled = value;
      },
    },
  };
  const pill = createPill({
    game: () => game,
    flush: async () => {
      writes++;
    },
    send: (type, payload) => replies.push({ type, ...payload }),
    ...extra,
  });
  return { pill, game, replies, writes: () => writes };
}
test('creator pill saves real progression without advertising a restorable simulation', async () => {
  const f = fixture();
  await f.pill.receive({ id: 1, action: 'save' });
  assert.equal(f.writes(), 1);
  assert.equal(f.replies[0].ok, true);
  assert.equal(f.replies[0].state.hasManualSave, false);
  await f.pill.receive({ id: 2, action: 'restore' });
  assert.equal(f.replies[1].ok, false);
  assert.equal(f.writes(), 1);
});
test('creator pill reports failed saves and rejects invalid requests', async () => {
  const f = fixture({
    flush: async () => {
      throw new Error('Conflict');
    },
  });
  await f.pill.receive({ id: 1, action: 'save' });
  assert.equal(f.replies[0].ok, false);
  await f.pill.receive({ id: '2', action: 'save' });
  await f.pill.receive({ id: 2, action: 'arbitrary' });
  assert.equal(f.replies.length, 1);
});
test('creator pill cannot rewind or restart a shared online room', async () => {
  let restarted = false;
  const f = fixture({
    restart: () => {
      restarted = true;
      return true;
    },
  });
  f.game.mode = 'online';
  await f.pill.receive({ id: 1, action: 'restart' });
  assert.equal(restarted, false);
  assert.equal(f.replies[0].ok, false);
  f.game.mode = 'single';
  await f.pill.receive({ id: 2, action: 'restart' });
  assert.equal(restarted, true);
  assert.equal(f.replies[1].ok, true);
});
test('creator pill sound state follows the game mixer', async () => {
  const f = fixture();
  await f.pill.receive({ id: 1, action: 'audio' });
  assert.equal(f.game.sfx.enabled, false);
  assert.equal(f.replies[0].state.audioState, 'off');
  await f.pill.receive({ id: 2, action: 'audio-status' });
  assert.equal(f.replies[1].state.audioState, 'off');
});

test('opening the pill does not mistake deliberately paused sound for autoplay blocking', async () => {
  const f = fixture({ audioPaused: () => true });
  f.game.sfx.ctx.state = 'suspended';
  await f.pill.receive({ id: 1, action: 'audio-status' });
  assert.equal(f.replies[0].ok, true);
  assert.equal(f.replies[0].state.audioState, 'on');
  await f.pill.receive({ id: 2, action: 'audio' });
  assert.equal(f.game.sfx.enabled, false);
  assert.equal(f.replies[1].state.audioState, 'off');
  await f.pill.receive({ id: 3, action: 'audio' });
  assert.equal(f.game.sfx.enabled, true);
  assert.equal(f.replies[2].state.audioState, 'on');
  assert.equal(f.game.sfx.ctx.state, 'suspended');
});

test('autoplay blocking returns actionable machine state, without claiming audible sound', async () => {
  const f = fixture();
  f.game.sfx.ctx.state = 'suspended';
  f.game.sfx.ctx.resume = async () => {};
  for (const action of ['audio-status', 'audio']) {
    await f.pill.receive({ id: f.replies.length, action });
    assert.equal(f.replies.at(-1).ok, true);
    assert.equal(f.replies.at(-1).state.audioState, 'blocked');
    assert.match(f.replies.at(-1).message, /tap the game/);
  }
});

test('sound status and mute still work while progress is saving', async () => {
  let finish;
  const f = fixture({
    flush: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const saving = f.pill.receive({ id: 1, action: 'save' });
  await f.pill.receive({ id: 2, action: 'audio-status' });
  await f.pill.receive({ id: 3, action: 'audio' });
  assert.equal(f.replies[0].state.audioState, 'on');
  assert.equal(f.replies[1].state.audioState, 'off');
  finish();
  await saving;
  assert.equal(f.replies[2].ok, true);
});
