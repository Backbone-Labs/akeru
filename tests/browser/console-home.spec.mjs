import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
  launchDemo,
} from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo();
});
test.afterAll(async () => {
  await demo.close();
});
test('last played appears only after runtime becomes playable and persists through reload', async ({
  page,
}) => {
  await page.goto(demo.url + '/games');
  await expect(page.locator('#recent-section')).toBeHidden();
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('link', { name: 'All games' }).click();
  await expect(page.locator('#recent-rail')).toContainText('Orbit study');
  await page.reload();
  await expect(page.locator('#recent-rail')).toContainText('Orbit study');
  await page.getByRole('searchbox').fill('not-a-game');
  await expect(page.locator('#game-grid')).toContainText(
    'Nothing here just yet.',
  );
});
test('live input and press-to-assign persist a physical button mapping', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/settings');
  await page.getByRole('button', { name: 'Remap controller' }).click();
  await expect(page.locator('.controller-test-status')).toContainText(
    'Controller detected',
  );
  await page
    .getByRole('button', { name: 'Assign Primary action', exact: true })
    .click();
  await page.waitForTimeout(80);
  await setGamepadButton(page, 3, 1);
  await expect(page.locator('[data-source=north]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(
    page.getByRole('combobox', { name: 'confirm control', exact: true }),
  ).toHaveValue('north');
  await setGamepadButton(page, 3, 0);
  await page.reload();
  await page.getByRole('button', { name: 'Remap controller' }).click();
  await expect(
    page.getByRole('combobox', { name: 'confirm control', exact: true }),
  ).toHaveValue('north');
});
test('paused runtime control panel keeps live input polling active', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await setGamepadButton(page, 2, 1);
  await expect(page.locator('[data-source=west]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('#runtime-overlay')).toBeVisible();
  await setGamepadButton(page, 2, 0);
});

test('Discover selection updates the feature, supports keyboard, and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demo.url + '/games');
  await expect(page.getByRole('link', { name: 'Shop Backbone' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Get the Backbone app' }),
  ).toBeVisible();
  await page.getByText('Pairing a Backbone Pro?', { exact: true }).click();
  await expect(
    page.getByText(/connect in your device’s Bluetooth settings/),
  ).toBeVisible();
  await page.evaluate(async () => {
    const { renderGameHome } = await import('/home.js');
    const catalog = await (await fetch('/catalog.json')).json();
    const entries = Array.from({ length: 6 }, (_, i) => ({
      ...catalog.entries[0],
      manifest: {
        ...catalog.entries[0].manifest,
        id: 'game-' + i,
        title: 'Game ' + i,
      },
    }));
    renderGameHome(document.querySelector('#main'), entries, {
      filters: { query: '', category: 'all' },
      recent: [],
      onFilters: () => {},
    });
  });
  await expect(
    page.getByRole('button', { name: 'Previous featured game' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Next featured game' }).click();
  await expect(page.locator('#featured-copy h2')).toHaveText('Game 1');
  await expect(page.locator('#featured-launch')).toHaveAttribute(
    'href',
    '/g/game-1',
  );
  await expect(
    page.getByRole('button', { name: 'Feature Game 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Feature Game 1', exact: true })
    .focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#featured-copy h2')).toHaveText('Game 0');
  await page.keyboard.press('End');
  await expect(page.locator('#featured-copy h2')).toHaveText('Game 5');
  await expect(
    page.getByRole('button', { name: 'Next featured game' }),
  ).toBeDisabled();
  expect(
    await page
      .locator('#feature-scene')
      .evaluate((e) => e.getAnimations().length),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole('searchbox').fill('Game 3');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(1);
});
