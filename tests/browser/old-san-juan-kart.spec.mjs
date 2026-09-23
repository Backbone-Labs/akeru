import { test, expect } from '@playwright/test';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/old-san-juan-kart/catalog.mjs';
import { installSimulatedGamepad, setGamepadButton } from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo({ titles: [options()] });
});
test.afterAll(async () => {
  await demo?.close();
});
test('kart launches at phone width, drives, and pauses without stuck throttle', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 1 });
  });
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/play/old-san-juan-kart');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#race')).toBeVisible({ timeout: 90000 });
  await setGamepadButton(page, 0, 1);
  const game = page.frames().find((f) => f !== page.mainFrame());
  await expect
    .poll(() => game.evaluate(() => window.__game.state))
    .toBe('race');
  // Skip only the cinematic countdown in software-rendered CI.
  await game.evaluate(() => {
    window.__game.race.start();
    window.__game.race.countdown = 0.01;
  });
  await setGamepadButton(page, 0, 1);
  await expect
    .poll(() => game.evaluate(() => window.__game.player.speed), {
      timeout: 25000,
    })
    .toBeGreaterThan(3);
  const box = await frame.locator('#scene').boundingBox();
  expect(box.width).toBe(844);
  expect(box.height).toBe(390);
  await setGamepadButton(page, 0, 0);
  await page.locator('#player-menu').click();
  await expect
    .poll(() => game.evaluate(() => window.akeruKart.active()))
    .toBe(false);
  expect(await game.evaluate(() => window.akeruKart.controls.throttle)).toBe(0);
  await page.evaluate(() =>
    document.querySelector('iframe').contentWindow.postMessage(
      {
        protocol: 'akeru.catalog.v1',
        nonce: 'forged',
        sequence: 999999,
        type: 'input',
        payload: { buttons: { confirm: 1 }, axes: {} },
      },
      '*',
    ),
  );
  await page.waitForTimeout(100);
  expect(await game.evaluate(() => window.akeruKart.controls.throttle)).toBe(0);
  await page.locator('#player-menu').click();
  await expect(frame.locator('#touch')).toBeHidden();
  await page.evaluate(() => window.__akeruTestGamepad.connect(false));
  await expect(frame.locator('#touch')).toBeVisible();
  await page.evaluate(() => window.__akeruTestGamepad.connect(true));
  await expect(frame.locator('#touch')).toBeHidden();
  await page.screenshot({ path: 'dist/previews/old-san-juan-kart.png' });
  expect(errors).toEqual([]);
});
