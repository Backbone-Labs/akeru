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

test('Discover spotlight scrolls with keyboard, keeps acquisition visible, and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demo.url + '/games');
  await expect(page.getByRole('link', { name: 'Shop Backbone' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Get the Backbone app' }),
  ).toBeVisible();
  await page.getByText('How do I connect?', { exact: true }).click();
  await expect(
    page.getByText(/pair it in your device’s Bluetooth settings/),
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
  const track = page.locator('#spotlight-track');
  await expect(
    page.getByRole('button', { name: 'Previous spotlight games' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Next spotlight games' }).click();
  await expect
    .poll(() => track.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(100);
  await track.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => track.evaluate((e) => e.scrollLeft)).toBe(0);
  expect(
    await page
      .locator('.controller-graphic')
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole('searchbox').fill('Game 3');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(1);
});
