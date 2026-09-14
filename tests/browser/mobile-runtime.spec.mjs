import { test, expect, launchDemo } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';

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
