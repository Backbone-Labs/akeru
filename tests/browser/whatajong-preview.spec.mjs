import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { whatajongOptions } from '../../packages/whatajong/catalog.mjs';
const built = existsSync(
  new URL('../../dist/whatajong/build-record.json', import.meta.url),
);
let demo;
test.beforeAll(async () => {
  if (built) demo = await startCatalogDemo({ titles: [whatajongOptions()] });
});
test.afterAll(async () => {
  await demo?.close();
});
async function launch(page) {
  await page.addInitScript(() =>
    localStorage.setItem('akeru.onboarding.v1', 'complete'),
  );
  await page.goto(`${demo.url}/g/whatajong`);
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await expect(frame.locator('.tile')).toHaveCount(54);
  return frame;
}
test('original Whatajong deal, blocked tiles, matching, lifecycle pause and persisted restore', async ({
  page,
}) => {
  test.skip(!built, 'Explicitly build the pinned local port first.');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const frame = await launch(page);
  const blocked = frame.locator('.tile[aria-disabled=true]').first();
  await blocked.evaluate((element) => element.click());
  await expect(frame.locator('.selected')).toHaveCount(0);
  await frame.locator('[data-action=hint]').click();
  const ids = await frame
    .locator('.hint')
    .evaluateAll((els) => els.map((el) => el.dataset.id));
  expect(ids).toHaveLength(2);
  await frame.locator(`[data-id="${ids[0]}"]`).click();
  await expect(frame.locator('.selected')).toHaveCount(1);
  await page.locator('#runtime-pause').click();
  await expect(frame.locator('#status')).toHaveText('Paused');
  await frame.locator(`[data-id="${ids[1]}"]`).click({ force: true });
  await expect(frame.locator('.tile')).toHaveCount(54);
  await page.locator('#runtime-pause').click();
  await frame.locator(`[data-id="${ids[1]}"]`).click();
  await expect(frame.locator('.tile')).toHaveCount(52);
  await expect(frame.locator('#score')).not.toHaveText('0');
  await expect(frame.locator('#save-status')).toBeEmpty();
  mkdirSync(new URL('../../dist/previews/', import.meta.url), {
    recursive: true,
  });
  await frame.locator('main').screenshot({
    path: new URL('../../dist/previews/whatajong.png', import.meta.url)
      .pathname,
  });
  await page.waitForTimeout(1000);
  const score = await frame.locator('#score').textContent();
  await page.locator('#runtime-exit').click();
  await page.getByRole('button', { name: /Play now/ }).click();
  const runtime = page.frameLocator('iframe');
  await expect(runtime.locator('.tile')).toHaveCount(52);
  await expect(runtime.locator('#score')).toHaveText(score);
  expect(errors).toEqual([]);
});
test('keyboard and real host gamepad input navigate/select without external title requests', async ({
  page,
}) => {
  test.skip(!built, 'Explicitly build the pinned local port first.');
  await page.addInitScript(() => {
    window.padButtons = {};
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [
        {
          id: 'Test controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: !!window.padButtons[i],
            value: window.padButtons[i] ? 1 : 0,
          })),
        },
      ],
    });
  });
  const frame = await launch(page);
  const origin = new URL(frame.url()).origin,
    requests = [];
  page.on('request', (r) => {
    if (r.frame() === frame && new URL(r.url()).origin !== origin)
      requests.push(r.url());
  });
  await frame.locator('[data-action=hint]').click();
  const before = await frame.locator('.focused').getAttribute('data-id');
  await page.keyboard.press('ArrowDown');
  await expect(frame.locator('.focused')).not.toHaveAttribute(
    'data-id',
    before,
  );
  await page.keyboard.press('Enter');
  await expect(frame.locator('.selected')).toHaveCount(1);
  await page.evaluate(() => {
    window.padButtons[1] = true;
  });
  await expect(frame.locator('.hint')).toHaveCount(2);
  await page.evaluate(() => {
    window.padButtons = {};
  });
  expect(requests).toEqual([]);
});
test('touch can remove an actual matching pair on a narrow viewport', async ({
  browser,
}) => {
  test.skip(!built, 'Explicitly build the pinned local port first.');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage(),
    frame = await launch(page);
  await frame.locator('[data-action=hint]').tap();
  const ids = await frame
    .locator('.hint')
    .evaluateAll((els) => els.map((el) => el.dataset.id));
  for (const id of ids) await frame.locator(`[data-id="${id}"]`).tap();
  await expect(frame.locator('.tile')).toHaveCount(52);
  expect(
    await frame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});

test('invalid opening-board save preserves its bytes and other title saves during continued play', async ({
  page,
}) => {
  test.skip(!built, 'Explicitly build the pinned local port first.');
  await page.goto(`${demo.url}/games`);
  const revisions = await page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js'),
      store = createSaveStore();
    const saved = {};
    for (const titleId of ['whatajong', 'other-game']) {
      const result = await store.forTitle({ titleId, schemaVersion: 1 }).write(
        'progress',
        {
          schemaVersion: 1,
          bytes: new TextEncoder().encode('{"version":999}'),
        },
        null,
      );
      saved[titleId] = result.revision;
    }
    return saved;
  });
  const frame = await launch(page);
  await expect(frame.locator('#save-status')).toContainText(
    'Existing progress is preserved',
  );
  await frame.locator('[data-action=hint]').click();
  const ids = await frame
    .locator('.hint')
    .evaluateAll((els) => els.map((e) => e.dataset.id));
  for (const id of ids) await frame.locator(`[data-id="${id}"]`).click();
  await expect(frame.locator('.tile')).toHaveCount(52);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js'),
      store = createSaveStore(),
      saved = {};
    for (const titleId of ['whatajong', 'other-game']) {
      const record = await store
        .forTitle({ titleId, schemaVersion: 1 })
        .read('progress');
      saved[titleId] = {
        revision: record.revision,
        bytes: new TextDecoder().decode(record.bytes),
      };
    }
    return saved;
  });
  for (const titleId of ['whatajong', 'other-game'])
    expect(after[titleId]).toEqual({
      revision: revisions[titleId],
      bytes: '{"version":999}',
    });
});
