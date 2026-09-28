import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const adapter = readFileSync(
  new URL(
    '../../packages/operation-blackline/src/multiplayer.js',
    import.meta.url,
  ),
  'utf8',
);
const motion = readFileSync(
  new URL('../../packages/operation-blackline/src/motion.js', import.meta.url),
  'utf8',
);
test('reconnect hydrates current death/ammo state, skips old events and continues the input sequence', async ({
  page,
}) => {
  await page.route('https://blackline.test/**', (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
      body: route.request().url().endsWith('/motion.js')
        ? motion
        : route.request().url().endsWith('.js')
          ? adapter
          : '<section id="akeru-room-panel"></section>',
    }),
  );
  await page.goto('https://blackline.test/');
  const result = await page.evaluate(async () => {
    const { installMultiplayer } = await import('/adapter.js');
    const seen = [],
      sent = [];
    const game = {
      engine: { menuCam: true },
      state: { phase: 'menu', players: new Map(), match: {} },
      net: {
        snaps: [],
        applied: 0,
        _onSnap(packet) {
          this.applied++;
          game.player.alive = packet.you.alive;
          game.player.hp = packet.you.hp;
        },
      },
      menus: {
        phase: 'menu',
        els: Object.fromEntries(
          ['loading-screen', 'pause-overlay', 'end-screen', 'hud', 'menu'].map(
            (k) => [k, document.createElement('div')],
          ),
        ),
        hideHint() {},
      },
      player: {
        alive: true,
        yaw: 0,
        pitch: 0,
        _keys: {},
        pos: {
          x: 0,
          y: 0,
          z: 0,
          set(x, y, z) {
            Object.assign(this, { x, y, z });
          },
        },
        vel: {
          x: 0,
          y: 0,
          z: 0,
          set(x, y, z) {
            Object.assign(this, { x, y, z });
          },
        },
        _deadT: 0,
        _physics() {},
        _applyCamera() {},
        _revive() {
          this.alive = true;
          seen.push('revive');
        },
        _clearKeys() {},
      },
      weapons: { idx: 0, reload() {}, _trigger: false },
      bus: {
        on() {},
        emit(name, value) {
          seen.push([name, value]);
          if (name === 'net:event' && value.k === 'spawn')
            game.player._revive();
          if (name === 'net:welcome')
            game.menus.phase = game.state.phase = 'playing';
          if (name === 'net:down') game.menus.phase = 'down';
        },
      },
    };
    const ui = installMultiplayer(game, () => ({
      active: true,
      multiplayer: (v) => sent.push(v),
    }));
    const snapshot = {
      round: 1,
      tick: 1,
      revision: 1,
      code: 'a'.repeat(20),
      phase: 'playing',
      owner: 'me',
      players: [
        { id: 'me', name: 'Me', entityId: 1, team: 0, connected: true },
      ],
      events: [
        { seq: 99, k: 'spawn', i: 1 },
        { seq: 100, k: 'shot', i: 1 },
      ],
      packets: {
        tick: 1,
        time: 0,
        ps: [],
        you: {
          alive: false,
          hp: 0,
          ackSeq: 1000,
          inputTicks: 2,
          spawn: 1,
          p: [0, 0, 0],
          velocity: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          ammo: [2, 32, 12],
          reserve: [90, 160, 48],
        },
        scores: [0, 1],
      },
    };
    ui.receive({
      status: 'connected',
      sessionId: 'me',
      inviteUrl: 'https://blackline.test/invite',
      snapshot,
    });
    const hydrated = {
      alive: game.player.alive,
      events: seen.filter((v) => Array.isArray(v) && v[0] === 'net:event'),
      revives: seen.filter((v) => v === 'revive').length,
      ammo: game.weapons.mags,
    };
    game.akeruPredictionUpdate(0.06);
    const whileDead = sent.filter((v) => v.action === 'input').length;
    snapshot.events.push({ seq: 101, k: 'shot', i: 2 });
    snapshot.tick = snapshot.revision = 2;
    ui.receive({ status: 'connected', snapshot });
    ui.receive({ status: 'connected', snapshot });
    snapshot.packets.tick = 2;
    snapshot.tick = snapshot.revision = 3;
    snapshot.packets.you.alive = true;
    snapshot.packets.you.hp = 100;
    snapshot.packets.you.spawn = 2;
    ui.receive({ status: 'connected', snapshot });
    game.akeruPredictionUpdate(0.06);
    const applied = game.net.applied;
    const stale = structuredClone(snapshot);
    stale.tick = 2;
    stale.revision = 2;
    stale.phase = 'countdown';
    stale.packets.you.alive = false;
    stale.packets.you.hp = 1;
    stale.packets.you.ammo = [99, 99, 99];
    stale.events.push({ seq: 500, k: 'spawn', i: 1 });
    ui.receive({ status: 'connected', snapshot: stale });
    // Same-tick publications have revisions: an old phase may not replace a newer one.
    ui.receive({ status: 'connected', snapshot: { ...stale, tick: 3 } });
    ui.receive({
      status: 'connected',
      snapshot: { ...stale, tick: 999, revision: 999, round: 0 },
    });
    const staleState = {
      applied: game.net.applied - applied,
      hp: game.player.hp,
      alive: game.player.alive,
      ammo: game.weapons.mags,
      lobby: game.akeruLobbyOpen,
    };
    const finished = { ...snapshot, tick: 4, revision: 4, phase: 'results' };
    ui.receive({ status: 'connected', snapshot: finished });
    ui.receive({ status: 'connected', snapshot });
    const resultsPreserved =
      game.akeruLobbyOpen &&
      document
        .querySelector('#room-status')
        .textContent.startsWith('Match complete');
    // Rematch can be published on the same simulation tick and must remain usable.
    ui.receive({
      status: 'connected',
      snapshot: { ...finished, revision: 5, phase: 'lobby', packets: null },
    });
    const rematchAccepted = document
      .querySelector('#room-status')
      .textContent.startsWith('Ready up');
    const nextRound = { ...snapshot, round: 2, tick: 5, revision: 6 };
    ui.receive({ status: 'connected', snapshot: nextRound });
    ui.receive({ status: 'reconnecting' });
    ui.receive({
      status: 'connected',
      snapshot: { ...nextRound, tick: 6, revision: 7 },
    });
    const reconnectAccepted = !game.akeruLobbyOpen && game.player.alive;
    ui.leave();
    ui.receive({
      status: 'connected',
      snapshot: {
        ...snapshot,
        code: 'b'.repeat(20),
        round: 0,
        tick: 0,
        revision: 1,
        phase: 'lobby',
        packets: null,
      },
    });
    ui.receive({
      status: 'connected',
      snapshot: { ...nextRound, tick: 7, revision: 8 },
    });
    const newRoomPreserved =
      document.querySelector('#code-label').textContent === 'b'.repeat(20) &&
      game.akeruLobbyOpen;
    return {
      hydrated,
      whileDead,
      staleState,
      resultsPreserved,
      rematchAccepted,
      reconnectAccepted,
      newRoomPreserved,
      input: sent.find((v) => v.action === 'input'),
      newEvents: seen.filter((v) => Array.isArray(v) && v[0] === 'net:event'),
    };
  });
  expect(result.whileDead).toBe(0);
  expect(result.hydrated).toEqual({
    alive: false,
    events: [],
    revives: 0,
    ammo: [2, 32, 12],
  });
  expect(result.input.input.seq).toBe(1001);
  expect(result.staleState).toEqual({
    applied: 0,
    hp: 100,
    alive: true,
    ammo: [2, 32, 12],
    lobby: false,
  });
  expect(result.resultsPreserved).toBe(true);
  expect(result.rematchAccepted).toBe(true);
  expect(result.reconnectAccepted).toBe(true);
  expect(result.newRoomPreserved).toBe(true);
  expect(result.newEvents).toEqual([
    ['net:event', { seq: 101, k: 'shot', i: 2 }],
  ]);
});
