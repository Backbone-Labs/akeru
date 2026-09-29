import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { puzzleOptions } from '../../packages/puzzle-preview/catalog.mjs';
const built = ['2048', 'hextris'].every((id) =>
  existsSync(new URL(`../../dist/${id}/build-record.json`, import.meta.url)),
);
let demo;
test.beforeAll(async () => {
  if (built)
    demo = await startCatalogDemo({
      titles: ['2048', 'hextris'].map(puzzleOptions),
    });
});
test.afterAll(async () => {
  await demo?.close();
});
for (const id of ['2048', 'hextris'])
  test(`${id} is playable with mouse, keyboard and isolated local runtime`, async ({
    page,
  }) => {
    test.skip(
      !built,
      'Build local puzzle sources explicitly before this test.',
    );
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem('akeru.onboarding.v1', 'complete'),
    );
    await page.goto(`${demo.url}/g/${id}`);
    await page.getByRole('button', { name: /Play now/ }).click();
    const runtime = page.frameLocator('iframe');
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    mkdirSync(new URL('../../dist/previews/', import.meta.url), {
      recursive: true,
    });
    if (id === '2048') {
      await expect(runtime.locator('.tile')).toHaveCount(16);
      for (let i = 0; i < 16; i++) {
        await runtime.locator('[data-action=left]').click();
        await page.keyboard.press('ArrowDown');
      }
      await expect(runtime.locator('#score')).not.toHaveText('0');
      await expect(runtime.locator('#save-status')).toBeEmpty();
      await runtime.locator('main').screenshot({
        path: new URL('../../dist/previews/2048.png', import.meta.url).pathname,
      });
    } else {
      await expect(runtime.locator('canvas')).toBeVisible();
      await expect(runtime.locator('#score')).toContainText('Best');
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await page.waitForTimeout(100);
      const before = await frame.evaluate(() => window.MainHex.position);
      await runtime.locator('[data-action=left]').click();
      await expect
        .poll(() => frame.evaluate(() => window.MainHex.position))
        .not.toBe(before);
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => frame.evaluate(() => window.MainHex.position))
        .toBe(before);
      await expect
        .poll(() => frame.evaluate(() => window.blocks.length), {
          timeout: 10000,
        })
        .toBeGreaterThan(0);
      await runtime.locator('canvas').screenshot({
        path: new URL('../../dist/previews/hextris.png', import.meta.url)
          .pathname,
      });
      // Exercise original matching/scoring with three settled, adjacent same-color blocks.
      await frame.evaluate(() => {
        window.blocks = [];
        window.MainHex.blocks = Array.from({ length: 6 }, () => []);
        for (let i = 0; i < 3; i++) {
          const b = new window.Block(
            0,
            window.colors[0],
            0,
            (window.MainHex.sideLength / 2) * Math.sqrt(3) +
              i * window.settings.blockHeight,
            1,
          );
          b.attachedLane = 0;
          b.checked = 1;
          b.initializing = 0;
          window.MainHex.blocks[0].push(b);
        }
      });
      await expect
        .poll(() => frame.evaluate(() => window.score))
        .toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
