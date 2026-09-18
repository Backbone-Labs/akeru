import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  test(`direct player opens without website UI at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const demo = await startCatalogDemo();
    try {
      await page.setViewportSize(viewport);
      const catalog = await (
        await page.request.get(demo.url + '/catalog.json')
      ).json();
      const id = catalog.entries[0].manifest.id;
      await page.goto(demo.url + '/play/' + id);
      await expect(page.locator('iframe')).toBeAttached();
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      await expect(page.locator('.masthead')).toBeHidden();
      await expect(page.locator('#demo-banner')).toBeHidden();
      await expect(page.locator('.runtime-bar')).toBeHidden();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Play now/ })).toHaveCount(
        0,
      );
      await page.evaluate(() => {
        document.body.style.setProperty('--player-safe-top', '20px');
        document.body.style.setProperty('--player-safe-right', '24px');
        document.body.style.setProperty('--player-safe-bottom', '16px');
        document.body.style.setProperty('--player-safe-left', '24px');
      });
      const box = await page.locator('iframe').boundingBox();
      expect(box.x).toBe(24);
      expect(box.y).toBe(20);
      expect(box.width).toBe(viewport.width - 48);
      expect(box.height).toBe(viewport.height - 36);
      await page
        .getByRole('button', { name: 'Game menu', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Paused', exact: true }),
      ).toBeVisible();
      await expect(page.locator('#touch-controls')).toBeHidden();
      await page
        .getByRole('button', { name: 'Touch controls', exact: true })
        .click();
      await expect(page.locator('#touch-controls')).toBeVisible();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      await page.setViewportSize({
        width: viewport.height,
        height: viewport.width,
      });
      const rotated = await page.locator('iframe').boundingBox();
      expect(rotated.height).toBe(viewport.width - 36);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await demo.close();
    }
  });
test('unknown direct game stays in a game-only unavailable screen', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await page.goto(demo.url + '/play/missing-game');
    await expect(
      page.getByRole('heading', { name: 'Game unavailable', exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Back to discover' }),
    ).toHaveCount(0);
    await expect(page.locator('.masthead')).toBeHidden();
  } finally {
    await demo.close();
  }
});

test('disabled direct game cannot launch and retry rechecks availability', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    demo.setAvailability('paused');
    await page.goto(demo.url + '/play/orbit-study');
    await expect(
      page.getByRole('heading', { name: 'Game unavailable', exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    demo.setAvailability('available');
    await page.getByRole('button', { name: /Try again/ }).click();
    await expect(page.locator('iframe')).toBeAttached();
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    await expect(page).toHaveURL(/\/play\/orbit-study$/);
  } finally {
    await demo.close();
  }
});

test('player pill exposes honest rumble/save status and confirms leaving without website navigation', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await page.goto(demo.url + '/play/orbit-study');
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    const menu = page.getByRole('button', { name: 'Game menu', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('button', { name: 'Rumble settings', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Controller rumble', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Controller rumble', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Test rumble', exact: true })
      .click();
    await expect(page.getByText(/No rumble sent/)).toBeVisible();
    await page
      .getByRole('button', { name: 'Saved progress', exact: true })
      .click();
    await expect(
      page.getByText(/saved record\(s\) for this game/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Leave game', exact: true }).click();
    await expect(page.locator('iframe')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Confirm leave game', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Game closed', exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page).toHaveURL(/\/play\/orbit-study$/);
  } finally {
    await demo.close();
  }
});
