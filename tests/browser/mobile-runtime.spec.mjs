import { test, expect, launchDemo } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';

test('desktop player can hide touch buttons and enter and leave fullscreen', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await launchDemo(page, demo.url);
    await page
      .getByRole('button', { name: 'Touch controls', exact: true })
      .click();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await page
      .getByRole('button', { name: 'Exit fullscreen', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
  } finally {
    await demo.close();
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`game and touch controls fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const demo = await startCatalogDemo();
    try {
      await page.setViewportSize(viewport);
      await launchDemo(page, demo.url);
      const controls = page.getByRole('group', { name: 'Game controls' });
      await expect(controls).toBeVisible();
      const box = await controls.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      await expect(
        page.getByRole('button', { name: 'Exit', exact: true }),
      ).toBeVisible();
    } finally {
      await demo.close();
    }
  });
}
