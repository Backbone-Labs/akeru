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
