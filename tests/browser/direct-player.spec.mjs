import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
  neutralGamepad,
} from './fixtures.mjs';
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
      expect(box.x).toBe(0);
      expect(box.y).toBe(0);
      expect(box.width).toBe(viewport.width);
      expect(box.height).toBe(viewport.height);
      const menuBox = await page.locator('#player-menu').boundingBox();
      expect(menuBox.y).toBeGreaterThanOrEqual(20);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(
        viewport.width - 24,
      );
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
      expect(rotated.height).toBe(viewport.width);
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
      .getByRole('button', { name: 'Sound and vibration', exact: true })
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
      page.getByText(/No saves yet|Progress saved/, { exact: true }),
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

test('controller navigates within a subpanel and B returns to its tile', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await installSimulatedGamepad(page);
    await page.goto(demo.url + '/play/orbit-study');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sound and vibration', exact: true })
      .click();
    const toggle = page.getByRole('button', {
      name: 'Controller rumble',
      exact: true,
    });
    const testButton = page.getByRole('button', {
      name: 'Test rumble',
      exact: true,
    });
    await expect(toggle).toBeFocused();
    await page.waitForTimeout(100);
    await setGamepadButton(page, 13, 1);
    await expect(testButton).toBeFocused();
    await neutralGamepad(page);
    await page.waitForTimeout(100);
    await setGamepadButton(page, 12, 1);
    await expect(toggle).toBeFocused();
    await neutralGamepad(page);
    await page.waitForTimeout(100);
    await setGamepadButton(page, 0, 1);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await neutralGamepad(page);
    await page.waitForTimeout(100);
    await setGamepadButton(page, 1, 1);
    await expect(page.locator('.player-action-detail')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Sound and vibration', exact: true }),
    ).toBeFocused();
    await expect(page.locator('#runtime-overlay')).toBeVisible();
    await neutralGamepad(page);
  } finally {
    await demo.close();
  }
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`player transitions survive quick close and reopen with ${reducedMotion}`, async ({
    page,
  }) => {
    const demo = await startCatalogDemo();
    try {
      await page.emulateMedia({ reducedMotion });
      await page.goto(demo.url + '/play/orbit-study');
      const menu = page.getByRole('button', { name: 'Game menu', exact: true });
      await menu.click();
      await page.evaluate(() => {
        document.querySelector('#player-menu').click();
        document.querySelector('#player-menu').click();
      });
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await page
        .locator('#runtime-overlay')
        .evaluate(async (e) =>
          Promise.all(e.getAnimations().map((a) => a.finished.catch(() => {}))),
        );
      await expect(page.locator('#runtime-overlay')).toBeVisible();
      await expect(page.locator('#runtime-overlay')).not.toHaveAttribute(
        'inert',
        '',
      );
      await page
        .getByRole('button', { name: 'Sound and vibration', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Close panel', exact: true })
        .click();
      await expect(page.locator('.player-action-detail')).toBeHidden();
      await menu.click();
      await expect(page.locator('#runtime-overlay')).toBeHidden();
    } finally {
      await demo.close();
    }
  });
}

test('controller opens the pill and selects a setting without touch', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await installSimulatedGamepad(page);
    await page.goto(demo.url + '/play/orbit-study');
    await expect(page.locator('#player-menu')).toBeEnabled();
    await page.waitForTimeout(150);
    await setGamepadButton(page, 9, 1);
    await expect(
      page.getByRole('button', { name: 'Resume', exact: true }),
    ).toBeFocused();
    await neutralGamepad(page);
    await page.waitForTimeout(150);
    await setGamepadButton(page, 15, 1);
    await expect(
      page.getByRole('button', { name: 'Controller settings', exact: true }),
    ).toBeFocused();
    await neutralGamepad(page);
    await page.waitForTimeout(150);
    await setGamepadButton(page, 15, 1);
    await expect(
      page.getByRole('button', { name: 'Touch controls', exact: true }),
    ).toBeFocused();
    await neutralGamepad(page);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect(
      page.getByRole('button', { name: 'Sound and vibration', exact: true }),
    ).toBeFocused();
    await neutralGamepad(page);
  } finally {
    await demo.close();
  }
});
