import { existsSync } from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { anarchOptions } from '../../packages/anarch/preview.mjs';

test('Anarch starts on a quick Enter tap and responds to desktop movement', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/anarch/build-record.json', import.meta.url),
    ),
    'Build the local game first',
  );
  const demo = await startCatalogDemo(anarchOptions());
  try {
    await page.route('**/title.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nwindow.gameTestState = () => engine?._akeru_state();',
      });
    });
    await page.goto(demo.url + '/g/anarch');
    await page.bringToFront();
    await page.getByRole('button', { name: /Play now/ }).click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#status')).toContainText('Enter');
    await frame.locator('canvas').focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.gameTestState()),
      )
      .toBe(1);
    const before = await frame.locator('canvas').evaluate((c) => c.toDataURL());
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    await expect
      .poll(() => frame.locator('canvas').evaluate((c) => c.toDataURL()))
      .not.toBe(before);
  } finally {
    await demo.close();
  }
});
