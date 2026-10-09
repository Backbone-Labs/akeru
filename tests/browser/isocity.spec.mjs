import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { isoCityOptions } from '../../packages/isocity/catalog.mjs';
import { installSimulatedGamepad, setGamepadButton } from './fixtures.mjs';
let demo;
const built = existsSync(
  new URL('../../dist/isocity/build-record.json', import.meta.url),
);
test.beforeAll(async () => {
  if (built) demo = await startCatalogDemo({ titles: [isoCityOptions()] });
});
test.afterAll(async () => await demo?.close());
test('IsoCity original placement supports touch/controller and isolated guest restore', async ({
  page,
}) => {
  test.skip(!built, 'Build IsoCity explicitly first.');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installSimulatedGamepad(page);
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.goto(demo.url + '/g/isocity');
  await page.getByRole('button', { name: /Play now/ }).click();
  const r = page.frameLocator('iframe');
  await expect(
    r.getByRole('button', { name: 'House', exact: true }),
  ).toBeVisible();
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await expect
    .poll(() => frame.evaluate(() => window.IsoCity.serialize().map[3][3][1]))
    .toBe(0);
  await page.waitForTimeout(150);
  await setGamepadButton(page, 0, 1);
  await page.waitForTimeout(80);
  await setGamepadButton(page, 0, 0);
  await expect
    .poll(() => frame.evaluate(() => window.IsoCity.serialize().map[3][3][1]))
    .toBe(1);
  await r.getByRole('button', { name: 'Tower', exact: true }).click();
  await r.locator('#fg').dispatchEvent('pointerdown', {
    clientX: 455,
    clientY: 350,
    pointerType: 'touch',
    button: 0,
  });
  await expect
    .poll(() =>
      frame.evaluate(
        () =>
          window.IsoCity.serialize()
            .map.flat()
            .filter((v) => v[1] === 5).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const before = await frame.evaluate(() => window.IsoCity.serialize());
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('button', { name: 'House', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .frames()
        .find((f) => f !== page.mainFrame())
        .evaluate(() => window.IsoCity.serialize()),
    )
    .toEqual(before);
  await page
    .frames()
    .find((f) => f !== page.mainFrame())
    .evaluate(() => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          window.IsoCity.select(
            r === 3 || c === 3 ? 10 : [1, 2, 4, 5, 6, 7, 8, 9][(r * 3 + c) % 8],
          );
          window.IsoCity.place(r, c);
        }
    });
  mkdirSync(new URL('../../dist/previews/', import.meta.url), {
    recursive: true,
  });
  await page
    .frameLocator('iframe')
    .locator('main')
    .screenshot({
      path: new URL('../../dist/previews/isocity.png', import.meta.url)
        .pathname,
    });
  expect(errors).toEqual([]);
});

test('IsoCity palette and touch placement remain reachable on a phone', async ({
  browser,
}) => {
  test.skip(!built, 'Build IsoCity explicitly first.');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.goto(demo.url + '/g/isocity');
  await page.getByRole('button', { name: /Play now/ }).click();
  const r = page.frameLocator('iframe');
  await expect(
    r.getByRole('button', { name: 'House', exact: true }),
  ).toBeVisible();
  await r.getByRole('button', { name: 'House', exact: true }).tap();
  const board = r.locator('#fg'),
    bounds = await board.boundingBox();
  await board.tap({
    position: { x: bounds.width / 2, y: (bounds.height * 352) / 666 },
  });
  await expect
    .poll(() =>
      page
        .frames()
        .find((f) => f !== page.mainFrame())
        .evaluate(() => window.IsoCity.serialize().map[3][3][1]),
    )
    .toBe(1);
  const palette = await r.locator('#tools').boundingBox();
  expect(palette.y + palette.height).toBeLessThan(844);
  await context.close();
});
