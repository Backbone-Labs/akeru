import { test, expect } from '@playwright/test';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo();
});
test.afterAll(async () => {
  await demo.close();
});
test('minimal guest flow is accessible, honest about accounts, and remembered', async ({
  page,
}) => {
  await page.goto(demo.url);
  await page.getByRole('button', { name: 'Start playing' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: /Let’s get started/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Connect your Backbone.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Continue without a controller' })
    .click();
  await page.getByRole('button', { name: 'Connect Backbone account' }).click();
  await expect(
    page.getByText(/Backbone account sign-in is not available/),
  ).toBeVisible();
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: /Less waiting/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Less waiting/ }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
test('recognizes already connected Backbone, generic reconnection and disconnect', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.testPad = {
      index: 0,
      id: 'Backbone Pro',
      mapping: 'standard',
      connected: true,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => (window.testPad ? [window.testPad] : []),
    });
  });
  await page.goto(demo.url);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.getByRole('button', { name: /Let’s get started/ }).click();
  await expect(page.locator('.connection-status')).toHaveText(
    'Backbone connected',
  );
  await page.evaluate(() => {
    window.testPad.buttons[0] = { pressed: true, value: 1 };
  });
  await expect(page.locator('.connection-hint')).toHaveText(
    'Input confirmed. You’re ready to play.',
  );
  await page.evaluate(() => {
    window.testPad.id = 'Xbox Wireless Controller';
  });
  await expect(page.locator('.connection-status')).toHaveText(
    'Controller connected',
  );
  await expect(page.locator('.connection-hint')).toHaveText(/Press a button/);
  await page.evaluate(() => {
    window.testPad.mapping = '';
  });
  await expect(page.locator('.connection-status')).toHaveText(
    'Controller detected',
  );
  await expect(page.locator('.connection-hint')).toHaveText(
    /does not report a standard layout/,
  );
  await page.evaluate(() => {
    window.testPad = null;
  });
  await expect(page.locator('.connection-status')).toHaveText(
    'Waiting for your controller',
  );
  await expect(
    page.getByRole('button', { name: 'Continue without a controller' }),
  ).toBeVisible();
});
test('small screens and reduced motion preserve the skip path', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(demo.url);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.getByRole('button', { name: /Let’s get started/ }).click();
  expect(
    await page
      .locator('.onboarding')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('landing, library and settings stay separate with persistent theme and remapping', async ({
  page,
}) => {
  await page.goto(demo.url);
  await expect(page.getByRole('heading', { name: /Good games/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.hero')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your setup.' }),
  ).toBeVisible();
  const before = await page.locator('html').getAttribute('data-theme');
  await page
    .getByRole('button', { name: 'Switch light / dark', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    before === 'dark' ? 'light' : 'dark',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    before === 'dark' ? 'light' : 'dark',
  );
  await page.getByRole('button', { name: 'Remap controller' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
