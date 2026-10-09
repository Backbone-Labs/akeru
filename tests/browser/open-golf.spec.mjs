import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { openGolfOptions } from '../../packages/open-golf/preview.mjs';
const built = existsSync(
  new URL('../../dist/open-golf/build-record.json', import.meta.url),
);
let demo;
test.beforeAll(async () => {
  if (built) demo = await startCatalogDemo(openGolfOptions());
});
test.afterAll(async () => {
  await demo?.close();
});
async function launch(page) {
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.route('**/title.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        '\nwindow.golfTest=()=>({state:engine?._akeru_state(),strokes:engine?._akeru_strokes(),x:engine?._akeru_ball_x(),paused,angle,power});',
    });
  });
  await page.goto(demo.url + '/g/open-golf');
  await page.getByRole('button', { name: /Play now/ }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#status')).toContainText('Choose', {
    timeout: 30000,
  });
  return frame;
}
test('original Open Golf plays, puts and pauses inside isolated host', async ({
  page,
}) => {
  test.skip(!built, 'Build pinned local Open Golf first.');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(m.text());
  });
  const frame = await launch(page);
  mkdirSync(new URL('../../dist/previews/', import.meta.url), {
    recursive: true,
  });
  // Let the original one-second menu fade finish before capturing the cover.
  await page.waitForTimeout(1250);
  await frame.locator('canvas').screenshot({
    path: new URL('../../dist/previews/open-golf.png', import.meta.url)
      .pathname,
  });
  await frame.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(
      () => frame.locator('canvas').evaluate(() => window.golfTest().state),
      { timeout: 15000 },
    )
    .toBe(2);
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      frame.locator('canvas').evaluate(() => window.golfTest().strokes),
    )
    .toBe(1);
  await page.locator('#runtime-pause').click();
  await expect
    .poll(() =>
      frame.locator('canvas').evaluate(() => window.golfTest().paused),
    )
    .toBe(true);
  const frozen = await frame
    .locator('canvas')
    .evaluate(() => window.golfTest().x);
  await page.waitForTimeout(300);
  expect(
    await frame.locator('canvas').evaluate(() => window.golfTest().x),
  ).toBe(frozen);
  await page.locator('#runtime-pause').click();
  await expect
    .poll(() =>
      frame.locator('canvas').evaluate(() => window.golfTest().paused),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});

test('controller selects a course, adjusts shot and saves through the scoped host', async ({
  page,
}) => {
  test.skip(!built, 'Build pinned local Open Golf first.');
  const { installSimulatedGamepad, setGamepadButton, neutralGamepad } =
    await import('./fixtures.mjs');
  await installSimulatedGamepad(page);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const frame = await launch(page);
  await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
  await expect(frame.locator('#status')).toContainText('course 2 /');
  await neutralGamepad(page);
  await setGamepadButton(page, 0, 1);
  await page.waitForTimeout(100);
  await neutralGamepad(page);
  await expect
    .poll(
      () => frame.locator('canvas').evaluate(() => window.golfTest().state),
      { timeout: 15000 },
    )
    .toBe(2);
  await page.evaluate(() => window.__akeruTestGamepad.axis(1, -1));
  await expect
    .poll(() => frame.locator('canvas').evaluate(() => window.golfTest().power))
    .toBeGreaterThan(0.5);
  await neutralGamepad(page);
  await setGamepadButton(page, 0, 1);
  await page.waitForTimeout(100);
  await neutralGamepad(page);
  await expect
    .poll(() =>
      frame.locator('canvas').evaluate(() => window.golfTest().strokes),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { createSaveStore } = await import('/saves/index.js');
        const record = await createSaveStore()
          .forTitle({ titleId: 'open-golf', schemaVersion: 1 })
          .read('progress');
        return record
          ? JSON.parse(new TextDecoder().decode(record.bytes)).seen_tutorial_0
          : null;
      }),
    )
    .toBe(1);
  const origins = new Set([demo.url, demo.titleOrigin]);
  expect(requests.filter((url) => !origins.has(new URL(url).origin))).toEqual(
    [],
  );
  await page.locator('#runtime-exit').click();
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toContainText(
    'Choose',
  );
});

test('mobile direct touch can aim and putt on the original course', async ({
  browser,
}) => {
  test.skip(!built, 'Build pinned local Open Golf first.');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const frame = await launch(page);
    await frame.locator('#putt').tap();
    await expect
      .poll(
        () => frame.locator('canvas').evaluate(() => window.golfTest().state),
        { timeout: 15000 },
      )
      .toBe(2);
    const box = await frame.locator('canvas').boundingBox();
    // Upstream aim circle follows the projected ball at x=.5, y=.565 in this viewport.
    const client = await context.newCDPSession(page);
    const x = box.x + box.width * 0.5,
      y = box.y + box.height * 0.565;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(150);
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.golfTest().state),
      )
      .toBe(3);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + 70 }],
    });
    await page.waitForTimeout(150);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.golfTest().strokes),
      )
      .toBe(1);
    expect(
      await frame
        .locator('body')
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('invalid progress remains unchanged and other title storage is isolated', async ({
  page,
}) => {
  test.skip(!built, 'Build pinned local Open Golf first.');
  await page.goto(demo.url + '/games');
  const revisions = await page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js');
    const store = createSaveStore(),
      result = {};
    for (const titleId of ['open-golf', 'other-game']) {
      const r = await store.forTitle({ titleId, schemaVersion: 1 }).write(
        'progress',
        {
          schemaVersion: 1,
          bytes: new TextEncoder().encode('{"foreign":true}'),
        },
        null,
      );
      result[titleId] = r.revision;
    }
    return result;
  });
  // Launch helper expects normal status; this saved-data failure is deliberate.
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.goto(demo.url + '/g/open-golf');
  await page.getByRole('button', { name: /Play now/ }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#status')).toContainText('Saves unavailable');
  await frame.locator('#putt').click();
  await page.waitForTimeout(3500);
  await frame.locator('#putt').click();
  await page.waitForTimeout(1300);
  const after = await page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js');
    const store = createSaveStore(),
      result = {};
    for (const titleId of ['open-golf', 'other-game']) {
      const r = await store
        .forTitle({ titleId, schemaVersion: 1 })
        .read('progress');
      result[titleId] = {
        revision: r.revision,
        text: new TextDecoder().decode(r.bytes),
      };
    }
    return result;
  });
  for (const id of ['open-golf', 'other-game'])
    expect(after[id]).toEqual({
      revision: revisions[id],
      text: '{"foreign":true}',
    });
});
