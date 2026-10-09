import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
  launchDemo,
  withCatalogCopies,
} from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo();
});
test.afterAll(async () => {
  await demo.close();
});
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(90);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(90);
};

test('web player HUD keeps its tools and Start opens a controller-scoped guide that B closes', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  const runtime = await launchDemo(page, demo.url);
  const hud = page.getByRole('group', { name: 'Game tools' });
  for (const name of [
    'Controls',
    'Touch controls',
    'Fullscreen',
    'Pause',
    'Exit',
  ])
    await expect(hud.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.locator('.runtime-wrap')).toHaveAttribute(
    'data-state',
    'playing',
  );
  await expect(page.locator('[data-runtime-state]')).toHaveText('Playing');
  await press(page, 9);
  const guide = page.getByRole('group', { name: 'Game menu' });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole('heading', { name: 'A little breather.' }),
  ).toBeVisible();
  const gameStatus = runtime.getByRole('status', { name: 'Game status' });
  await expect(gameStatus).toHaveText('Paused');
  await expect(page.locator('[data-runtime-state]')).toHaveText('Paused');
  await expect(
    guide.getByRole('button', { name: /Keep playing/ }),
  ).toBeFocused();
  for (const name of [
    /Controller layout/,
    /On-screen controls/,
    /Full screen/,
    /Appearance/,
    /Exit game/,
  ])
    await expect(guide.getByRole('button', { name })).toBeVisible();
  // The fixture title advertises no host actions, so none are offered.
  await expect(guide.getByRole('button', { name: /snapshot/ })).toHaveCount(0);
  await expect(guide.getByRole('button', { name: /Game sound/ })).toHaveCount(
    0,
  );
  await press(page, 13);
  await expect(
    guide.getByRole('button', { name: /Controller layout/ }),
  ).toBeFocused();
  await press(page, 12);
  await press(page, 12);
  await expect(
    page.locator('.runtime-tools button:focus'),
    'guide focus never falls back to the HUD',
  ).toHaveCount(0);
  await press(page, 1);
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await expect(gameStatus).toHaveText('Ready when you are.');
  await expect(
    hud.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible();
});

test('guide exit and quick switch leave through the existing /g/:id URLs', async ({
  page,
}) => {
  await withCatalogCopies(page, 2);
  await page.addInitScript(() =>
    localStorage.setItem(
      'akeru.recent.v1',
      JSON.stringify([
        { id: 'orbit-copy-1', at: Date.now() - 60000 },
        { id: 'not-in-catalog', at: Date.now() - 1000 },
      ]),
    ),
  );
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const guide = page.getByRole('group', { name: 'Game menu' });
  const quick = guide.getByRole('link', { name: 'Switch to Orbit copy 1' });
  await expect(quick).toHaveAttribute('href', '/g/orbit-copy-1');
  await expect(guide.getByRole('link', { name: /Switch to/ })).toHaveCount(1);
  const theme = await page.locator('html').getAttribute('data-theme');
  await guide.getByRole('button', { name: /Appearance/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', theme);
  await guide.getByRole('button', { name: /Exit game/ }).click();
  await expect(page).toHaveURL(/\/g\/orbit-study$/);
  await expect(page.getByRole('dialog', { name: 'Orbit study' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(
    page
      .frameLocator('iframe[title="Orbit study isolated runtime"]')
      .getByRole('status', { name: 'Game status' }),
  ).toHaveText('Ready when you are.');
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page
    .getByRole('group', { name: 'Game menu' })
    .getByRole('link', { name: 'Switch to Orbit copy 1' })
    .click();
  await expect(page).toHaveURL(/\/g\/orbit-copy-1$/);
  await expect(
    page.getByRole('dialog', { name: 'Orbit copy 1' }),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('guide rows reuse the HUD tools for touch controls and the remap panel', async ({
  page,
}) => {
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const guide = page.getByRole('group', { name: 'Game menu' });
  const touchRow = guide.getByRole('button', { name: /On-screen controls/ });
  const hidden = () =>
    page.locator('#touch-controls').evaluate((element) => element.hidden);
  const before = await hidden();
  await expect(touchRow.locator('em')).toHaveText(before ? 'Off' : 'On');
  await touchRow.click();
  expect(await hidden()).toBe(!before);
  await expect(touchRow.locator('em')).toHaveText(before ? 'On' : 'Off');
  await expect(
    page.getByRole('button', { name: 'Touch controls', exact: true }),
  ).toHaveAttribute('aria-pressed', String(before));
  // The paused guide keeps the virtual pad out of the way.
  await expect(page.locator('#touch-controls')).toBeHidden();
  await guide.getByRole('button', { name: /Controller layout/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Control settings' }),
  ).toBeVisible();
  await expect(guide).toBeVisible();
});

test('pause toggles wait for the opening reveal instead of resuming it early', async ({
  page,
}) => {
  await page.goto(demo.url + '/g/orbit-study');
  await page.getByRole('button', { name: /Play now/ }).click();
  const pauseButton = page.getByRole('button', { name: 'Pause', exact: true });
  await pauseButton.click();
  await expect(page.locator('.runtime-wrap')).toHaveAttribute(
    'data-state',
    'loading',
  );
  await expect(page.locator('#runtime-overlay.launch-screen')).toBeVisible();
  const status = page
    .frameLocator('iframe[title="Orbit study isolated runtime"]')
    .getByRole('status', { name: 'Game status' });
  await expect(status).toHaveText('Ready when you are.');
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await expect(page.locator('.runtime-wrap')).toHaveAttribute(
    'data-state',
    'playing',
  );
  await pauseButton.click();
  await expect(page.getByRole('group', { name: 'Game menu' })).toBeVisible();
  await expect(status).toHaveText('Paused');
});
