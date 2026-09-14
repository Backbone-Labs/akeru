import { existsSync, mkdirSync } from 'node:fs';
import { test, expect, installSimulatedGamepad } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { freedoomOptions } from '../../packages/freedoom/catalog.mjs';
for (const id of ['freedoom1', 'freedoom2', 'freedm']) {
  test(
    id +
      ' renders the original game, accepts controller and keyboard, pauses and saves',
    async ({ page }) => {
      test.setTimeout(60000);
      test.skip(
        !existsSync(
          new URL('../../dist/' + id + '/build-record.json', import.meta.url),
        ),
        'Build the local Freedoom source first',
      );
      await installSimulatedGamepad(page);
      const demo = await startCatalogDemo(freedoomOptions(id));
      try {
        await page.route('**/title.js', async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body:
              (await response.text()) +
              '\nwindow.gameTestState = () => ({ tic: engine?._akeru_tic(), level: engine?._akeru_level(), state: engine?._akeru_state(), paused, mask, saveBlocked });',
          });
        });
        await page.goto(demo.url + '/g/' + id);
        await page.getByRole('button', { name: /Play now/ }).click();
        const frame = page.frameLocator('iframe');
        await expect(frame.locator('#status')).toContainText('WASD', {
          timeout: 20000,
        });
        await expect
          .poll(() =>
            frame
              .locator('canvas')
              .evaluate(() => window.gameTestState().state),
          )
          .toBe(0);
        const before = await frame
          .locator('canvas')
          .evaluate((c) => c.toDataURL());
        await frame.locator('canvas').focus();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(350);
        await page.keyboard.up('ArrowRight');
        await expect
          .poll(() => frame.locator('canvas').evaluate((c) => c.toDataURL()))
          .not.toBe(before);
        await page.evaluate(() => window.__akeruTestGamepad.axis(0, 0.8));
        await expect
          .poll(() =>
            frame.locator('canvas').evaluate(() => window.gameTestState().mask),
          )
          .toBe(1 << 11);
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
        await expect
          .poll(() =>
            frame.locator('canvas').evaluate(() => window.gameTestState().mask),
          )
          .toBe(0);
        await page
          .getByRole('button', { name: 'Touch controls', exact: true })
          .click();
        const up = page
          .getByRole('group', { name: 'Game controls' })
          .getByRole('button', { name: 'Up', exact: true });
        const box = await up.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect
          .poll(() =>
            frame.locator('canvas').evaluate(() => window.gameTestState().mask),
          )
          .toBe(1 << 4);
        await page.mouse.up();
        await expect
          .poll(() =>
            frame.locator('canvas').evaluate(() => window.gameTestState().mask),
          )
          .toBe(0);
        await frame.getByRole('button', { name: 'Sound off' }).click();
        await expect(
          frame.getByRole('button', { name: 'Sound on' }),
        ).toBeVisible();
        await frame.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(frame.locator('#status')).toContainText('Progress saved');
        if (id === 'freedm') {
          await frame.getByRole('button', { name: 'Next map' }).click();
          await expect
            .poll(() =>
              frame
                .locator('canvas')
                .evaluate(() => window.gameTestState().level),
            )
            .toBe(102);
        }
        await page.waitForTimeout(1000); // Let the original map transition wipe finish.
        mkdirSync(new URL('../../dist/previews/', import.meta.url), {
          recursive: true,
        });
        await frame.locator('canvas').screenshot({
          path: new URL('../../dist/previews/' + id + '.png', import.meta.url)
            .pathname,
        });
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect
          .poll(() =>
            frame
              .locator('canvas')
              .evaluate(() => window.gameTestState().paused),
          )
          .toBe(true);
        const tic = await frame
          .locator('canvas')
          .evaluate(() => window.gameTestState().tic);
        await page.waitForTimeout(200);
        expect(
          await frame
            .locator('canvas')
            .evaluate(() => window.gameTestState().tic),
        ).toBe(tic);
        await expect(frame.locator('#status')).toContainText('saved');
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await expect
          .poll(() =>
            frame.locator('canvas').evaluate(() => window.gameTestState().tic),
          )
          .toBeGreaterThan(tic);
        await page.reload();
        await page.getByRole('button', { name: /Play now/ }).click();
        await expect(
          page.frameLocator('iframe').locator('#status'),
        ).toContainText('Progress restored', { timeout: 20000 });
      } finally {
        await demo.close();
      }
    },
  );
}
