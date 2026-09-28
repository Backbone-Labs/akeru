import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const adapter = readFileSync(
  new URL(
    '../../packages/operation-blackline/src/multiplayer.js',
    import.meta.url,
  ),
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
      body: route.request().url().endsWith('.js')
        ? adapter
        : '<section id="akeru-room-panel"></section>',
    }),
  );
  await page.goto('https://blackline.test/');
  const result = await page.evaluate(async () => {
    const { installMultiplayer } = await import('/adapter.js');
    const seen = [],
      sent = [];
    let tick;
    const game = {
      engine: { menuCam: true },
      state: { phase: 'menu', players: new Map(), match: {} },
      net: {
        snaps: [],
        _onSnap(packet) {
          game.player.alive = packet.you.alive;
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
        pos: { set() {} },
        vel: { set() {} },
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
        },
      },
      onLoop(fn) {
        tick = fn;
      },
    };
    const ui = installMultiplayer(game, () => ({
      active: true,
      multiplayer: (v) => sent.push(v),
    }));
    const snapshot = {
      round: 1,
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
        you: {
          alive: false,
          ackSeq: 1000,
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
    tick(0.06);
    snapshot.events.push({ seq: 101, k: 'shot', i: 2 });
    ui.receive({ status: 'connected', snapshot });
    ui.receive({ status: 'connected', snapshot });
    return {
      hydrated,
      input: sent.find((v) => v.action === 'input'),
      newEvents: seen.filter((v) => Array.isArray(v) && v[0] === 'net:event'),
    };
  });
  expect(result.hydrated).toEqual({
    alive: false,
    events: [],
    revives: 0,
    ammo: [2, 32, 12],
  });
  expect(result.input.input.seq).toBe(1001);
  expect(result.newEvents).toEqual([
    ['net:event', { seq: 101, k: 'shot', i: 2 }],
  ]);
});
