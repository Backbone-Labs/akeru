import { installSimulatedGamepad, setGamepadButton } from './fixtures.mjs';
import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { serverSurvivalOptions } from '../../packages/server-survival/catalog.mjs';
let demo;
const built = existsSync(
  new URL('../../dist/server-survival/build-record.json', import.meta.url),
);
test.beforeAll(async () => {
  if (built)
    demo = await startCatalogDemo({ titles: [serverSurvivalOptions()] });
});
test.afterAll(async () => await demo?.close());
test('original Server Survival builds services, saves through host, and restores after exit', async ({
  page,
}) => {
  test.setTimeout(60000);
  test.skip(!built, 'Explicitly build upstream Server Survival first.');
  const errors = [],
    external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:')) external.push(r.url());
  });
  await installSimulatedGamepad(page);
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.goto(demo.url + '/g/server-survival');
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await expect(
    page.frameLocator('iframe').locator('[data-i18n=sandbox_mode]'),
  ).toBeVisible();
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.locator('[data-i18n=sandbox_mode]').click();
  await expect(frame.locator('#main-menu-modal')).toBeHidden();
  await frame.locator('#tool-alb').click();
  await frame.evaluate(() => {
    window.__serverSurvivalTestInput = null;
    addEventListener('message', (event) => {
      if (
        event.source === parent &&
        event.data?.protocol === 'akeru.catalog.v1' &&
        event.data.type === 'input'
      )
        window.__serverSurvivalTestInput = event.data.payload;
    });
  });
  await setGamepadButton(page, 15, 1);
  await expect
    .poll(() =>
      frame.evaluate(
        () =>
          Number.parseFloat(
            document.querySelector('#akeru-cursor').style.left,
          ) -
          innerWidth / 2,
      ),
    )
    .toBeGreaterThan(60);
  await setGamepadButton(page, 15, 0);
  await expect
    .poll(() =>
      frame.evaluate(() => window.__serverSurvivalTestInput?.buttons.right),
    )
    .toBe(0);
  await expect(frame.locator('#akeru-cursor')).toBeVisible();
  await setGamepadButton(page, 0, 1);
  await expect
    .poll(() =>
      frame.evaluate(() => window.__serverSurvivalTestInput?.buttons.confirm),
    )
    .toBe(1);
  await expect
    .poll(() => frame.evaluate(() => window.STATE.services.length))
    .toBe(1);
  await setGamepadButton(page, 0, 0);
  await expect
    .poll(() =>
      frame.evaluate(() => window.__serverSurvivalTestInput?.buttons.confirm),
    )
    .toBe(0);
  await frame.locator('#btn-save').click();
  await frame.locator('[data-i18n=save_browser]').click();
  await expect
    .poll(() =>
      frame.evaluate(() => window.akeruStorage.getItem('serverSurvivalSave')),
    )
    .not.toBeNull();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('button', { name: /Play now/ }).click();
  const restored = page.frameLocator('iframe');
  await expect(restored.locator('#load-btn')).toBeVisible();
  await restored.locator('#load-btn').click();
  await expect
    .poll(() =>
      page
        .frames()
        .find((f) => f !== page.mainFrame())
        .evaluate(() => window.STATE.services.length),
    )
    .toBe(1);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  mkdirSync(new URL('../../dist/previews/', import.meta.url), {
    recursive: true,
  });
  await restored.locator('body').screenshot({
    path: new URL('../../dist/previews/server-survival.png', import.meta.url)
      .pathname,
  });
});

test('phone landscape tutorial fits the viewport and its actions remain reachable', async ({
  page,
}) => {
  test.skip(!built, 'Explicitly build upstream Server Survival first.');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(demo.url + '/play/server-survival');
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-i18n=sandbox_mode]').click();
  const game = page.frames().find((f) => f !== page.mainFrame());
  await game.evaluate(() => {
    window.tutorial.start();
    window.tutorial.currentStep = 1;
    window.tutorial.showStep();
  });
  const popup = frame.locator('#tutorial-popup');
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(390);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(844);
  await frame.locator('#tutorial-next').click();
  await frame.locator('#tutorial-skip').click();
  await expect(frame.locator('#tutorial-modal')).toBeHidden();
  const canvas = await frame.locator('#canvas-container canvas').boundingBox();
  expect(canvas.width).toBe(844);
  expect(canvas.height).toBe(390);
});
