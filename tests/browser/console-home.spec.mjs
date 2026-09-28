import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
  launchDemo,
  withCatalogCopies,
  settleAnimations,
} from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo();
});
test.afterAll(async () => {
  await demo.close();
});
const closeSheet = (page) =>
  page.getByRole('button', { name: /close game details/ }).click();
test('last played appears only after runtime becomes playable and persists through reload', async ({
  page,
}) => {
  await page.goto(demo.url + '/games');
  await expect(page.locator('#row-recent')).toHaveCount(0);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('#recent-section')).toBeHidden();
  await expect(page.locator('#library-empty')).toBeVisible();
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page).toHaveURL(/\/g\/orbit-study$/);
  await closeSheet(page);
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.locator('#row-recent')).toContainText('Orbit study');
  await page.reload();
  await expect(page.locator('#row-recent')).toContainText('Orbit study');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('#recent-rail')).toContainText('Orbit study');
  await expect(page.locator('#library-empty')).toBeHidden();
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

test('bento, rows, discover and search keep real detail targets and never render catalog text as markup', async ({
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
        title:
          i === 3 ? '<img src=x onerror="window.injected=1">' : 'Game ' + i,
      },
      metadata: {
        ...catalog.entries[0].metadata,
        category: i % 3 ? 'puzzle' : 'racing',
      },
    }));
    renderGameHome(document.querySelector('#main'), entries, {
      filters: { query: '', category: 'all' },
      recent: [
        { id: 'game-5', at: Date.now() - 7200000 },
        { id: 'game-0', at: Date.now() - 60000 },
      ],
      onFilters: () => {},
    });
  });
  await expect(page.locator('#home-title')).toContainText(
    'What are we playing?',
  );
  await expect(page.locator('#home-subtitle')).toHaveText(
    '31 games. Ready when you are.',
  );
  await expect(page.locator('.bento-feature .bento-link')).toHaveAttribute(
    'href',
    '/g/game-0',
  );
  const continueTile = page.locator('.bento [data-area="c1"]');
  await expect(continueTile).toHaveAttribute('href', '/g/game-5');
  await expect(continueTile).toContainText('CONTINUE');
  await expect(continueTile).toContainText('Last played 2 hours ago');
  await expect(
    page.locator('.bento-promo a[data-promo="app"]'),
  ).toHaveAttribute(
    'href',
    /^https:\/\/backbone\.com\/download\?.*utm_source=akeru/,
  );
  await expect(page.locator('#row-recent .game-card')).toHaveCount(2);
  await expect(page.locator('#row-puzzle .game-card')).toHaveCount(20);
  await expect(page.locator('#row-racing .game-card')).toHaveCount(11);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('#main img[src="x"]')).toHaveCount(0);
  await page.locator('.home-chip', { hasText: 'Racing' }).click();
  await expect(page.locator('#row-racing .game-card').first()).toBeFocused();
  await page.keyboard.press('y');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('searchbox').fill('Game 9');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Browse all 31 games' }).click();
  await expect(
    page.getByRole('button', { name: 'Discover', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(31);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.locator('#filters .filter', { hasText: 'Racing' }).click();
  await expect(page.locator('#game-grid .game-card')).toHaveCount(11);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator('#featured-launch')).toBeVisible();
});

test('the game sheet opens over the hub at the same /g/:id URL and restores place and focus', async ({
  page,
}) => {
  await withCatalogCopies(page, 12);
  await page.goto(demo.url + '/games');
  await expect(page.locator('#row-puzzle .game-card')).toHaveCount(6);
  const card = page
    .locator('#row-puzzle')
    .getByRole('link', { name: /Orbit copy 5/ });
  await card.scrollIntoViewIfNeeded();
  await settleAnimations(page);
  const scrolled = await page.evaluate(() => scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await card.click();
  await expect(page).toHaveURL(/\/g\/orbit-copy-5$/);
  const sheet = page.getByRole('dialog', { name: 'Orbit copy 5' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#play-button')).toBeFocused();
  await expect(
    sheet.getByRole('link', { name: /View source on GitHub/ }),
  ).toHaveAttribute('href', 'https://github.com/Backbone-Labs/akeru');
  await expect(sheet).toContainText('MIT');
  await expect(sheet).toContainText('Unknown');
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/games$/);
  await expect(sheet).toBeHidden();
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await card.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/games$/);
  await expect(sheet).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(/\/g\/orbit-copy-5$/);
  await expect(sheet).toBeVisible();
  await page.goto(demo.url + '/g/orbit-copy-2');
  await expect(
    page.getByRole('dialog', { name: 'Orbit copy 2' }),
  ).toBeVisible();
  await closeSheet(page);
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.locator('#home-title')).toBeVisible();
});

test('saved games stay in a shell-owned library across reloads', async ({
  page,
}) => {
  await page.goto(demo.url + '/g/orbit-study');
  const sheet = page.getByRole('dialog', { name: 'Orbit study' });
  await sheet.getByRole('button', { name: 'Add to library' }).click();
  await expect(
    sheet.getByRole('button', { name: /In your library/ }),
  ).toBeVisible();
  await expect(sheet.getByRole('status')).toHaveText(
    'Orbit study is in your library.',
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('akeru.library.v1')).map((r) => r.id),
    ),
  ).toEqual(['orbit-study']);
  await closeSheet(page);
  await expect(page.locator('#row-saved')).toContainText('Orbit study');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('#saved-grid')).toContainText('Orbit study');
  await page.reload();
  await expect(page.locator('#row-saved')).toContainText('Orbit study');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('#saved-grid')).toContainText('Orbit study');
  await page.locator('#saved-grid').getByRole('link').click();
  await sheet.getByRole('button', { name: /In your library/ }).click();
  await closeSheet(page);
  await expect(page.locator('#saved-section')).toBeHidden();
  await expect(page.locator('#library-empty')).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      'akeru.library.v1',
      JSON.stringify([
        { id: '../account', at: 1 },
        { id: 'not-in-catalog', at: 2 },
        { id: 'orbit-study', at: 'soon' },
      ]),
    ),
  );
  await page.reload();
  await expect(page.locator('#saved-section')).toBeHidden();
  await expect(page.locator('#row-saved')).toHaveCount(0);
});

test('controller A on a home cover launches through availability checks and B closes the sheet it returns to', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  await page.goto(demo.url + '/games');
  await expect(page.locator('#featured-launch')).toBeVisible();
  await page.locator('.bento-feature .bento-link').focus();
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
  await expect(page.getByRole('dialog', { name: 'Orbit study' })).toBeVisible();
  await setGamepadButton(page, 1, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, 1, 0);
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#row-recent')).toContainText('Orbit study');
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
      await expect(page.locator('#home-bento')).toBeHidden();
      await expect(page.locator('#home-rows .home-row')).toHaveCount(0);
      await expect(page.locator('.console-empty')).toBeVisible();
      await expect(page.locator('[data-shortcut="play"]')).toBeDisabled();
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await expect(page.locator('#recent-section')).toBeHidden();
      await expect(page.locator('#library-empty')).toBeVisible();
      await page.getByRole('button', { name: 'Discover', exact: true }).click();
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
  const sheet = page.getByRole('dialog', { name: 'Orbit study' });
  await expect(sheet).toBeVisible();
  const art = await sheet.locator('.sheet-art').boundingBox();
  const cover = await sheet.locator('.sheet-art .console-cover').boundingBox();
  expect(cover.height).toBeCloseTo(art.height, 2);
  await press(1);
  await expect(page).toHaveURL(/\/games$/);
  await expect(sheet).toBeHidden();
  await page.locator('.console-header [data-theme-toggle]').focus();
  const theme = await page.locator('html').getAttribute('data-theme');
  await press(0);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'light' ? 'dark' : 'light',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'light' ? 'dark' : 'light',
  );
});

test('profile panel is honest about guest play and returns focus when closed', async ({
  page,
}) => {
  await page.goto(demo.url + '/games');
  const guest = page.getByRole('button', { name: 'Guest profile' });
  await guest.click();
  const panel = page.getByRole('dialog', { name: 'Guest' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Playing as a guest');
  await expect(panel).toContainText(
    'Backbone account sign-in isn’t available in this preview.',
  );
  await expect(panel.locator('[data-stat="games"]')).toHaveText('1');
  const before = await page.locator('html').getAttribute('data-theme');
  await panel.getByRole('button', { name: /Appearance/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before);
  await expect(
    panel.getByRole('link', { name: /Get the Backbone app/ }),
  ).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(guest).toBeFocused();
  await guest.click();
  await page.getByRole('link', { name: /All settings/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
