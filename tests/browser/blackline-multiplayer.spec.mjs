import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startMultiplayerDemo } from '../../examples/catalog-demo/multiplayer-all.mjs';
import { installSimulatedGamepad } from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  test.skip(
    !existsSync(
      new URL('../../dist/operation-blackline/title.js', import.meta.url),
    ),
    'Run npm run build:multiplayer first',
  );
  demo = await startMultiplayerDemo();
});
test.afterAll(async () => {
  await demo?.close();
});
test('Blackline guests join, ready by mouse/touch, play using host controller input and reconnect', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1100, height: 800 } }),
    browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
    }),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  try {
    await installSimulatedGamepad(a);
    await a.goto(`${demo.url}/play/operation-blackline`);
    const fa = a.frameLocator('iframe');
    await expect(fa.locator('#create-room')).toBeVisible({ timeout: 60000 });
    const af = a.frames().find((f) => f !== a.mainFrame());
    // Boot and render the real scene, then avoid software GPU stalls during socket assertions.
    await af.evaluate(() => {
      const game = window.Game,
        applyCamera = game.player._applyCamera.bind(game.player);
      game.__cameraTick = 0;
      game.player._applyCamera = () => {
        applyCamera();
        game.__cameraTick++;
      };
      game.engine.renderer.render = () => {
        game.__renderedCameraTick = game.__cameraTick;
      };
    });
    await fa.locator('#create-room').click();
    await expect(fa.locator('#code-label')).toHaveText(/^[a-f0-9]{20}$/);
    await b.goto(await fa.locator('#invite-link').inputValue());
    const fb = b.frameLocator('iframe');
    await expect(fb.locator('#room-players')).toContainText('Operator 2', {
      timeout: 60000,
    });
    const bf = b.frames().find((f) => f !== b.mainFrame());
    await bf.evaluate(() => {
      window.Game.engine.renderer.render = () => {};
    });
    await fa.locator('#ready-room').click({ delay: 250 });
    await expect(fa.locator('#ready-room')).toHaveText('Unready');
    await fb.locator('#ready-room').tap();
    await expect(fa.locator('#start-room')).toBeEnabled();
    await fa.locator('#start-room').click();
    await expect
      .poll(() => af.evaluate(() => window.Game.state.players.size))
      .toBe(10);
    await expect
      .poll(() => bf.evaluate(() => window.Game.state.players.size))
      .toBe(10);
    await expect
      .poll(() => af.evaluate(() => window.Game.engine.menuCam))
      .toBe(false);
    await expect
      .poll(() => af.evaluate(() => window.Game.net.snaps.at(-1)?.you.ackSeq), {
        timeout: 10000,
      })
      .toBeGreaterThan(-1);
    await expect
      .poll(() =>
        af.evaluate(
          () =>
            window.Game.__cameraTick > 0 &&
            window.Game.__renderedCameraTick === window.Game.__cameraTick,
        ),
      )
      .toBe(true);
    // Delay/reorder authoritative checkpoints while holding one movement direction.
    // The old pos.set(snapshot.p) implementation jumped backwards every 50 ms.
    await af.evaluate(() => {
      const prediction = window.Game.akeruPrediction;
      const reconcile = prediction.reconcile.bind(prediction);
      const timers = new Set();
      let n = 0;
      prediction.reconcile = (...args) => {
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            reconcile(...args);
          },
          [105, 70, 130, 85][n++ % 4],
        );
        timers.add(timer);
      };
      window.__restoreBlacklineReconciliation = () => {
        prediction.reconcile = reconcile;
        for (const timer of timers) clearTimeout(timer);
      };
    });
    await a.bringToFront();
    await a.evaluate(() => window.__akeruTestGamepad.axis(0, 0.8));
    const movement = await af.evaluate(
      () =>
        new Promise((resolve) => {
          const samples = [],
            start = performance.now(),
            game = window.Game;
          const yaw = game.player.yaw;
          const sample = () => {
            const now = performance.now();
            if (now - start > 350)
              samples.push({
                time: now,
                x:
                  game.engine.camera.position.x * Math.cos(yaw) -
                  game.engine.camera.position.z * Math.sin(yaw),
              });
            if (now - start < 1800) requestAnimationFrame(sample);
            else resolve(samples);
          };
          requestAnimationFrame(sample);
        }),
    );
    await a.evaluate(() => window.__akeruTestGamepad.axis(0, 0));
    await af.evaluate(() => window.__restoreBlacklineReconciliation());
    expect(movement.length).toBeGreaterThan(30);
    expect(movement.at(-1).x - movement[0].x).toBeGreaterThan(2);
    const backwardJumps = movement
      .slice(1)
      .map((sample, index) => sample.x - movement[index].x);
    expect(Math.min(...backwardJumps)).toBeGreaterThan(-0.045);
    const before = await af.evaluate(() => window.Game.net.snaps.at(-1).you.p);
    await a.evaluate(() => {
      window.__akeruTestGamepad.axis(0, 0.8);
      window.__akeruTestGamepad.axis(2, 0.6);
      window.__akeruTestGamepad.button(7, 1);
    });
    await expect
      .poll(() => af.evaluate(() => window.Game.net.snaps.at(-1).you.ammo[0]))
      .toBeLessThan(30);
    await expect
      .poll(() => af.evaluate(() => window.Game.net.snaps.at(-1).you.p), {
        timeout: 10000,
      })
      .not.toEqual(before);
    const id = await af.evaluate(() => window.Game.state.myId);
    await expect
      .poll(() => bf.evaluate((id) => window.Game.state.players.get(id)?.p, id))
      .not.toEqual(before);
    await a.evaluate(() => {
      window.__akeruTestGamepad.axis(0, 0);
      window.__akeruTestGamepad.axis(2, 0);
      window.__akeruTestGamepad.button(7, 0);
    });
    const player = await af.evaluate(() => ({
      id: window.Game.state.myId,
      team: window.Game.state.team,
    }));
    await a.reload();
    const fr = a.frameLocator('iframe');
    await expect(fr.locator('#resume-room')).toBeVisible({ timeout: 60000 });
    await a
      .frames()
      .find((f) => f !== a.mainFrame())
      .evaluate(() => {
        window.Game.engine.renderer.render = () => {};
      });
    await fr.locator('#resume-room').click();
    await expect
      .poll(() =>
        a
          .frames()
          .find((f) => f !== a.mainFrame())
          .evaluate(() => ({
            id: window.Game.state.myId,
            team: window.Game.state.team,
          })),
      )
      .toEqual(player);
    await expect(fr.locator('#menu')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
