import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import {
  expect,
  expectNoHorizontalOverflow,
  installSimulatedGamepad,
  launchDemo,
  neutralGamepad,
  orbPosition,
  setGamepadButton,
  test,
} from './fixtures.mjs';

let demo;

test.beforeAll(async () => {
  demo = await startCatalogDemo();
});

test.afterAll(async () => {
  await demo?.close();
});

test.beforeEach(async () => {
  demo.setAvailability('available');
});

test('browses from catalog to detail and launches the isolated original fixture', async ({
  page,
}) => {
  await page.goto(demo.url);
  await expect(page.getByRole('heading', { name: /Good games/ })).toBeVisible();
  await expect(page.getByText('1 game', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Orbit study/ }).click();
  await expect(page).toHaveURL(/\/g\/orbit-study$/);
  await expect(
    page.getByRole('heading', { name: 'Orbit study' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Play now/ }).click();
  const runtime = page.frameLocator(
    'iframe[title="Orbit study isolated runtime"]',
  );
  await expect(
    runtime.getByRole('heading', { name: 'Find a little space.' }),
  ).toBeVisible();
  await expect(runtime.getByRole('status', { name: 'Game status' })).toHaveText(
    'Ready when you are.',
  );
  await expect(page.locator('#runtime-overlay')).toBeHidden();
});

test('holds and releases touch input while an idle controller remains connected', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  const runtime = await launchDemo(page, demo.url);
  const right = page.getByRole('button', { name: 'Right', exact: true });
  const before = await orbPosition(runtime);
  const box = await right.boundingBox();
  const browser = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 41 };

  await browser.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await expect(runtime.getByRole('status', { name: 'Game status' })).toHaveText(
    'Touch input connected',
  );
  await expect
    .poll(async () => (await orbPosition(runtime)).x)
    .toBeGreaterThan(before.x + 5);

  await browser.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(100);
  const released = await orbPosition(runtime);
  await page.waitForTimeout(200);
  const settled = await orbPosition(runtime);
  expect(Math.abs(settled.x - released.x)).toBeLessThan(1);
});

test('uses Start to pause and resume a running session', async ({ page }) => {
  await installSimulatedGamepad(page);
  await launchDemo(page, demo.url);
  await page.waitForTimeout(100);

  await setGamepadButton(page, 9, 1);
  await expect(
    page.getByRole('heading', { name: 'A little breather.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  await neutralGamepad(page);
  await page.waitForTimeout(100);
  await setGamepadButton(page, 9, 1);
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await neutralGamepad(page);
});

test('persists a per-title controller remap across reload', async ({
  page,
}) => {
  await launchDemo(page, demo.url);
  await page.getByRole('button', { name: 'Controls' }).click();
  const confirm = page.getByRole('combobox', { name: 'confirm control' });
  await confirm.selectOption('north');
  await expect(confirm).toHaveValue('north');

  await page.reload();
  await page.getByRole('button', { name: /Play now/ }).click();
  const runtime = page.frameLocator(
    'iframe[title="Orbit study isolated runtime"]',
  );
  await expect(runtime.getByRole('status', { name: 'Game status' })).toHaveText(
    'Ready when you are.',
  );
  await page.getByRole('button', { name: 'Controls' }).click();
  await expect(
    page.getByRole('combobox', { name: 'confirm control' }),
  ).toHaveValue('north');
});

test('requires a neutral controller after synthetic focus recovery', async ({
  page,
}) => {
  await installSimulatedGamepad(page);
  const runtime = await launchDemo(page, demo.url);
  await page.waitForTimeout(100);

  await setGamepadButton(page, 15, 1);
  await expect(runtime.getByRole('status', { name: 'Game status' })).toHaveText(
    'Controller input connected',
  );
  await expect
    .poll(async () => (await orbPosition(runtime)).x)
    .toBeGreaterThan(5);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);
  const blurred = await orbPosition(runtime);
  await page.waitForTimeout(200);
  expect(Math.abs((await orbPosition(runtime)).x - blurred.x)).toBeLessThan(1);

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(200);
  expect(Math.abs((await orbPosition(runtime)).x - blurred.x)).toBeLessThan(1);

  await neutralGamepad(page);
  await page.waitForTimeout(100);
  await setGamepadButton(page, 15, 1);
  await expect
    .poll(async () => (await orbPosition(runtime)).x)
    .toBeGreaterThan(blurred.x + 5);
  await neutralGamepad(page);
});

test('rejects a forged runtime message sent by the shell window', async ({
  page,
}) => {
  await launchDemo(page, demo.url);
  const frame = page.locator('iframe[title="Orbit study isolated runtime"]');
  const source = new URL(await frame.getAttribute('src'));
  const nonce = new URLSearchParams(source.hash.slice(1)).get('nonce');

  await page.evaluate((value) => {
    window.postMessage(
      {
        protocol: 'akeru.catalog.v1',
        nonce: value,
        sequence: Number.MAX_SAFE_INTEGER,
        type: 'exit',
        payload: {},
      },
      location.origin,
    );
  }, nonce);
  await page.waitForTimeout(100);

  await expect(frame).toBeAttached();
  await expect(
    page.getByRole('heading', { name: 'Orbit study' }),
  ).toBeVisible();
});

test('renders paused, unpublished, and unknown routes safely', async ({
  page,
}) => {
  demo.setAvailability('paused');
  await page.goto(`${demo.url}/g/orbit-study`);
  await expect(
    page.getByRole('button', { name: 'Temporarily unavailable' }),
  ).toBeDisabled();
  await expect(page.getByText('This game is taking a break.')).toBeVisible();

  demo.setAvailability('unpublished');
  await page.goto(`${demo.url}/g/orbit-study`);
  await expect(
    page.getByRole('heading', { name: 'This game isn’t available.' }),
  ).toBeVisible();
  await page.goto(demo.url);
  await expect(page.getByText('The library is being prepared.')).toBeVisible();

  await page.evaluate(() =>
    window.catalogPreview.navigate('/outside-the-catalog'),
  );
  await expect(
    page.getByRole('heading', { name: 'A little off the map.' }),
  ).toBeVisible();
});

test('has no horizontal overflow through the mobile browse, detail, runtime, and controls flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demo.url);
  await expect(page.getByRole('heading', { name: /Good games/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('link', { name: /Orbit study/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Orbit study' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /Play now/ }).click();
  const runtime = page.frameLocator(
    'iframe[title="Orbit study isolated runtime"]',
  );
  await expect(runtime.getByRole('status', { name: 'Game status' })).toHaveText(
    'Ready when you are.',
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Controls' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Control settings' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const frameOverflow = await runtime
    .locator('html')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(frameOverflow).toBeLessThanOrEqual(0);
});
