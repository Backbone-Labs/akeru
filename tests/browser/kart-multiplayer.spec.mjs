import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/old-san-juan-kart/catalog.mjs';
import { installSimulatedGamepad, setGamepadButton } from './fixtures.mjs';
let worker, demo;
test.beforeAll(async () => {
  test.skip(
    !existsSync(new URL('../../dist/kart-server/kart.js', import.meta.url)),
    'Run npm run build:kart-multiplayer first',
  );
  const { startKartServer } =
    await import('../../packages/old-san-juan-kart/multiplayer/server.mjs');
  const origins = [];
  worker = await startKartServer({ origins, allowHeadless: true });
  demo = await startCatalogDemo({
    titles: [options({ multiplayer: true })],
    multiplayerEndpoint: `http://127.0.0.1:${worker.port}`,
  });
  origins.push(demo.url);
});
test.afterAll(async () => {
  await demo?.close();
  await worker?.close();
});
test('two browser guests join by invite, ready, race and recover a connection', async ({
  browser,
}) => {
  test.setTimeout(240000);
  const contexts = await Promise.all([
    browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
    }),
    browser.newContext({ viewport: { width: 1000, height: 700 } }),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const page of pages) {
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 1 });
    });
  }
  try {
    const [a, b] = pages;
    await installSimulatedGamepad(a);
    await a.goto(`${demo.url}/play/old-san-juan-kart`);
    const fa = a.frameLocator('iframe');
    await expect(fa.locator('#create-room')).toBeVisible({ timeout: 90000 });
    await a
      .frames()
      .find((f) => f !== a.mainFrame())
      .evaluate(() => {
        const e = window.__game.engine;
        e.maxPixelRatio = 0.25;
        e.renderer.setPixelRatio(0.25);
        e.composer.setPixelRatio(0.25);
        e.renderer.shadowMap.enabled = false;
        // This suite verifies socket/input state; avoid software-GPU readback stalls after loading the real scene.
        e.composer.render = () => {};
        e.resize();
      });
    await fa.locator('#create-room').click();
    await expect(fa.locator('#code-label')).toHaveText(/^[a-f0-9]{20}$/, {
      timeout: 15000,
    });
    const link = await fa.locator('#invite-link').inputValue();
    await b.goto(link);
    const fb = b.frameLocator('iframe');
    await expect(fb.locator('#room-players')).toContainText('Racer 2', {
      timeout: 90000,
    });
    await b
      .frames()
      .find((f) => f !== b.mainFrame())
      .evaluate(() => {
        const e = window.__game.engine;
        e.maxPixelRatio = 0.25;
        e.renderer.setPixelRatio(0.25);
        e.composer.setPixelRatio(0.25);
        e.renderer.shadowMap.enabled = false;
        // This suite verifies socket/input state; avoid software-GPU readback stalls after loading the real scene.
        e.composer.render = () => {};
        e.resize();
      });
    await expect(fa.locator('#room-players')).toContainText('Racer 2');
    // Sharing an invite can pause the host. Lobby choices remain usable, while
    // gameplay input stays suspended (covered by the channel isolation test).
    await a.locator('#player-menu').click();
    await expect(fa.locator('body')).toHaveAttribute('data-paused', 'true');
    await fa.locator('#ready-room').dispatchEvent('click');
    await expect(fa.locator('#ready-room')).toHaveText('Unready');
    await fa.locator('#ready-room').dispatchEvent('click');
    await expect(fa.locator('#ready-room')).toHaveText('Ready · A');
    await a.locator('#player-menu').click();
    // Hold through several server snapshots, as a real mouse/touch press does.
    await a.bringToFront();
    await fa.locator('#ready-room').click({ delay: 250 });
    await expect(fa.locator('#ready-room')).toHaveText('Unready');
    await fa.locator('#ready-room').click({ delay: 250 });
    await expect(fa.locator('#ready-room')).toHaveText('Ready · A');
    await fa.locator('#ready-room').tap();
    await expect(fa.locator('#ready-room')).toHaveText('Unready');
    await fa.locator('#ready-room').tap();
    await expect(fa.locator('#ready-room')).toHaveText('Ready · A');
    // A on the focused lobby control uses the same authenticated gamepad path as driving.
    await a.bringToFront();
    await fa.locator('#ready-room').focus();
    await setGamepadButton(a, 0, 1);
    await expect(fa.locator('#ready-room')).toHaveText('Unready');
    await setGamepadButton(a, 0, 0);
    await fb.locator('#ready-room').click();
    await expect(fa.locator('#start-room')).toBeEnabled();
    await a.bringToFront();
    await fa.locator('#start-room').click();

    await expect(fa.locator('#multiplayer-panel')).toBeHidden({
      timeout: 20000,
    });
    const ga = a.frames().find((f) => f !== a.mainFrame()),
      gb = b.frames().find((f) => f !== b.mainFrame());
    await expect
      .poll(() => ga.evaluate(() => window.__game.race.state), {
        timeout: 15000,
      })
      .toBe('racing');
    await setGamepadButton(a, 0, 1);
    await expect
      .poll(() => ga.evaluate(() => window.__game.player.speed), {
        timeout: 15000,
      })
      .toBeGreaterThan(2);
    await expect
      .poll(
        () =>
          gb.evaluate(
            () => window.__game.karts.find((k) => !k.isPlayer)?.speed,
          ),
        { timeout: 10000 },
      )
      .toBeGreaterThan(2);
    await setGamepadButton(a, 0, 0);
    // Keyboard directions must drive, never open the lobby or stay focused in its invite field.
    await expect(fa.locator('#scene')).toBeFocused();
    await a.keyboard.down('ArrowUp');
    await expect
      .poll(() => ga.evaluate(() => window.__game.input.state.throttle))
      .toBe(1);
    await expect(fa.locator('#multiplayer-panel')).toBeHidden();
    await a.keyboard.down('ArrowLeft');
    await expect
      .poll(() => ga.evaluate(() => window.__game.input.state.steer))
      .toBe(-1);
    await a.keyboard.press('Escape');
    await expect(fa.locator('#multiplayer-panel')).toBeVisible();
    await expect(fa.locator('#resume-race')).toBeFocused();
    await expect
      .poll(() => ga.evaluate(() => window.__game.input.state.throttle))
      .toBe(0);
    await a.keyboard.up('ArrowUp');
    await a.keyboard.up('ArrowLeft');
    await a.keyboard.press('Escape');
    await expect(fa.locator('#multiplayer-panel')).toBeHidden();
    await expect(fa.locator('#scene')).toBeFocused();
    await a.keyboard.down('KeyW');
    await expect
      .poll(() => ga.evaluate(() => window.__game.input.state.throttle))
      .toBe(1);
    await a.keyboard.up('KeyW');
    // Online menus stop only this player's input; the shared race clock keeps advancing.
    const before = await ga.evaluate(() => window.__game.race.raceTime);
    await fa.locator('#online-menu').click();
    await expect(fa.locator('#multiplayer-panel')).toBeVisible();
    await expect
      .poll(() => ga.evaluate(() => window.__game.race.raceTime))
      .toBeGreaterThan(before + 0.3);
    // Opening the host menu from the race menu must need only one Resume.
    await a.locator('#player-menu').click();
    await expect(fa.locator('body')).toHaveAttribute('data-paused', 'true');
    await expect(fa.locator('#multiplayer-panel')).toBeHidden();
    await a.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(fa.locator('body')).toHaveAttribute('data-paused', 'false');
    await expect(fa.locator('#scene')).toBeFocused();
    await a.keyboard.down('ArrowUp');
    await expect
      .poll(() => ga.evaluate(() => window.__game.input.state.throttle))
      .toBe(1);
    await expect
      .poll(() => ga.evaluate(() => window.__game.player.speed))
      .toBeGreaterThan(2);
    await expect(fa.locator('#multiplayer-panel')).toBeHidden();
    await a.keyboard.up('ArrowUp');
    await contexts[1].setOffline(true);
    await expect(fb.locator('#network-status')).toContainText('Reconnecting', {
      timeout: 18000,
    });
    await contexts[1].setOffline(false);
    await expect(fa.locator('#room-players')).not.toContainText(
      'Reconnecting',
      { timeout: 15000 },
    );
    await fb.locator('#leave-room').click();
    await expect(fb.locator('#race')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
