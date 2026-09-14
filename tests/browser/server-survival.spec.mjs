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
  await setGamepadButton(page, 15, 1);
  await page.waitForTimeout(250);
  await setGamepadButton(page, 15, 0);
  await expect(frame.locator('#akeru-cursor')).toBeVisible();
  await setGamepadButton(page, 0, 1);
  await page.waitForTimeout(80);
  await setGamepadButton(page, 0, 0);
  await expect
    .poll(() => frame.evaluate(() => window.STATE.services.length))
    .toBe(1);
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
