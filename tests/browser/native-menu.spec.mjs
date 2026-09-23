import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
for (const accepted of [true, false])
  test(`native menu handoff requires acknowledgement: ${accepted}`, async ({
    page,
  }) => {
    const demo = await startCatalogDemo();
    try {
      await page.addInitScript((accepted) => {
        window.webkit = {
          messageHandlers: {
            akeruPlayer: {
              postMessage: async (value) =>
                value.action === 'menu' ? accepted : false,
            },
          },
        };
      }, accepted);
      await page.goto(demo.url + '/play/orbit-study');
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      if (accepted) {
        await expect(page.locator('#player-menu')).toBeHidden();
        await expect(page.locator('#touch-controls')).toBeHidden();
        expect(
          await page.evaluate(() => window.akeruNative.command('pause')),
        ).toBe('Paused');
        expect(
          await page.evaluate(() => window.akeruNative.command('resume')),
        ).toBe('Playing');
        expect(
          await page.evaluate(async () => {
            try {
              await window.akeruNative.command('anything');
              return false;
            } catch {
              return true;
            }
          }),
        ).toBe(true);
      } else {
        await expect(page.locator('#player-menu')).toBeVisible();
        expect(
          await page.evaluate(async () => {
            try {
              await window.akeruNative.command('pause');
              return false;
            } catch {
              return true;
            }
          }),
        ).toBe(true);
      }
    } finally {
      await demo.close();
    }
  });
