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
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
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

test('console selection, keyboard, search and touch layout keep real detail targets', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(demo.url + '/games');
  await page.evaluate(async () => {
    window.catalogPreview.dispose();
    const { renderGameHome } = await import('/home.js');
    const catalog = await (await fetch('/catalog.json')).json();
    const entries = Array.from({ length: 31 }, (_, i) => ({
      ...catalog.entries[0],
      manifest: {
        ...catalog.entries[0].manifest,
        id: 'game-' + i,
        title: 'Game ' + i,
      },
    }));
    renderGameHome(document.querySelector('#main'), entries, {
      filters: { query: '', category: 'all' },
      recent: [{ id: 'game-0', at: 1 }],
      onFilters: () => {},
    });
  });
  const geometry = () =>
    page
      .locator('.console-stage, #console-shelf-cards > button')
      .evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      );
  const initialGeometry = await geometry();
  await expect(
    page.locator('#console-shelf-cards .console-game-picker'),
  ).toHaveCount(6);
  await expect(page.locator('#recent-rail .recent-card')).toHaveCount(1);
  await expect(page.locator('.console-collection-grid .game-card')).toHaveCount(
    25,
  );
  await page
    .getByRole('button', { name: 'Feature Game 1', exact: true })
    .click();
  await expect(page.locator('#featured-copy h1')).toHaveText('Game 1');
  expect(await geometry()).toEqual(initialGeometry);
  await expect(page.locator('#featured-details')).toHaveAttribute(
    'href',
    '/g/game-1',
  );
  await page
    .getByRole('button', { name: 'Feature Game 1', exact: true })
    .focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#featured-copy h1')).toHaveText('Game 0');
  await page.keyboard.press('End');
  await expect(page.locator('#featured-copy h1')).toHaveText('Game 5');
  await expect(page.locator('#featured-details')).toHaveAttribute(
    'href',
    '/g/game-5',
  );
  expect(
    await page
      .locator('#feature-scene')
      .evaluate((e) => e.getAnimations().length),
  ).toBe(0);
  await page.keyboard.press('y');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('searchbox').fill('Game 9');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await page.getByRole('button', { name: 'Browse all 31 games' }).click();
  await expect(page.locator('#game-grid .game-card')).toHaveCount(31);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator('#featured-launch')).toBeVisible();
});

test('controller A on a home cover launches through availability checks and removes the console lifecycle', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/games');
  await expect(page.locator('#featured-launch')).toBeVisible();
  await page.locator('.console-game-picker').focus();
  await setGamepadButton(page, 0, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, 0, 0);
  await expect(
    page
      .frameLocator('iframe[title="Orbit study isolated runtime"]')
      .getByRole('status', { name: 'Game status' }),
  ).toHaveText('Ready when you are.');
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/console-home-active/);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('link', { name: 'All games' }).click();
  await expect(page.locator('#console-shelf-title')).toHaveText(
    'Your next game',
  );
  await expect(page.locator('#console-shelf-cards')).toContainText(
    'Orbit study',
  );
});

test('a stale home selection cannot launch a title paused after rendering', async ({
  page,
}) => {
  try {
    await page.goto(demo.url + '/games');
    await expect(page.locator('#featured-launch')).toBeVisible();
    demo.setAvailability('paused');
    await page.locator('#featured-launch').click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Temporarily unavailable' }),
    ).toBeDisabled();
  } finally {
    demo.setAvailability('available');
  }
});

test('empty and paused catalogs never fabricate playable recommendations or history', async ({
  page,
}) => {
  try {
    for (const state of ['paused', 'unpublished']) {
      demo.setAvailability(state);
      await page.goto(demo.url + '/games');
      await expect(page.locator('.console-stage')).toBeHidden();
      await expect(page.locator('.console-shelf')).toBeHidden();
      await expect(page.locator('.console-empty')).toBeVisible();
      await expect(page.locator('[data-shortcut="play"]')).toBeDisabled();
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await expect(page.locator('#recent-section')).toBeHidden();
      await expect(page.locator('#game-grid .game-card')).toHaveCount(
        state === 'paused' ? 1 : 0,
      );
    }
  } finally {
    demo.setAvailability('available');
  }
});

test('controller triggers, search keyboard, details and theme work across console screens', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/games');
  await expect(page.locator('#featured-launch')).toBeVisible();
  const press = async (index) => {
    await setGamepadButton(page, index, 1);
    await page.waitForTimeout(80);
    await setGamepadButton(page, index, 0);
    await page.waitForTimeout(80);
  };
  await setGamepadButton(page, 7, 1);
  await expect(
    page.getByRole('button', { name: 'Discover', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(500);
  await expect(
    page.getByRole('button', { name: 'Discover', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await setGamepadButton(page, 7, 0);
  await page.waitForTimeout(80);
  await press(7);
  await expect(
    page.getByRole('button', { name: 'Library', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await press(7);
  await expect(
    page.getByRole('button', { name: 'Home', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await press(6);
  await expect(
    page.getByRole('button', { name: 'Library', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await press(3);
  await expect(
    page.getByRole('dialog', { name: 'Search with controller' }),
  ).toBeVisible();
  await press(15); // A -> B, spatial movement between keys
  await expect(
    page.locator('.console-keys button').filter({ hasText: /^B$/ }),
  ).toBeFocused();
  await press(0);
  await expect(page.getByRole('searchbox')).toHaveValue('b');
  await press(1);
  await expect(page.locator('.console-keyboard')).toHaveCount(0);
  await press(1);
  await expect(
    page.getByRole('button', { name: 'Home', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await press(2);
  await expect(page).toHaveURL(/\/g\/orbit-study$/);
  await expect(page.locator('.console-header')).toBeVisible();
  const art = await page.locator('.detail-art').boundingBox();
  const cover = await page.locator('.detail-art .console-cover').boundingBox();
  expect(cover.height).toBeCloseTo(art.height, 2);
  await page.locator('.console-header [data-theme-toggle]').focus();
  const theme = await page.locator('html').getAttribute('data-theme');
  await press(0);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'light' ? 'dark' : 'light',
  );
  await press(1);
  await expect(page).toHaveURL(/\/games$/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'light' ? 'dark' : 'light',
  );
});

test('controller can navigate settings, adjust controls and close remapping without leaving console', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/settings');
  await expect(
    page.getByRole('button', { name: 'Remap controller' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remap controller' }).focus();
  await setGamepadButton(page, 0, 1);
  await expect(page.locator('.akeru-control-settings')).toBeVisible();
  await setGamepadButton(page, 0, 0);
  await page.waitForTimeout(100);
  await setGamepadButton(page, 1, 1);
  await expect(page.locator('.akeru-control-settings')).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
  await setGamepadButton(page, 1, 0);
});
