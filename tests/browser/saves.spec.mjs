import { readFile } from 'node:fs/promises';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { test, expect, launchDemo } from './fixtures.mjs';
let demo;
test.beforeAll(async () => {
  demo = await startCatalogDemo();
});
test.afterAll(async () => {
  await demo.close();
});
test('restores guest progress after a reload and resets only on confirmation', async ({
  page,
}) => {
  await page.goto(demo.url);
  await launchDemo(page, demo.url);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#save-status')).toContainText('this browser');
  const box = await page
    .getByRole('button', { name: 'Right', exact: true })
    .boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(900); // Allow the fixture's 750ms autosave checkpoint.
  await expect(frame.locator('#save-status')).toHaveText(
    'Progress saved in this browser.',
  );
  const saved = await frame.locator('#orb').evaluate((e) => e.style.transform);
  await page.reload();
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(frame.locator('#save-status')).toHaveText(
    'Progress restored from this browser.',
  );
  await expect(frame.locator('#orb')).toHaveAttribute(
    'style',
    `transform: ${saved};`,
  );
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export saves', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.titleId).toBe('orbit-study');
  expect(exported.records[0].slot).toBe('position');
  await page.getByRole('button', { name: 'Reset saves', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm reset', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Confirm reset', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Local saves for this game have been reset.',
  );
});
test('IndexedDB isolates titles and prevents stale writes across connections', async ({
  page,
}) => {
  await page.goto(demo.url);
  const result = await page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js');
    const a = createSaveStore(),
      b = createSaveStore();
    const one = a.forTitle({ titleId: 'first', schemaVersion: 1 }),
      two = b.forTitle({ titleId: 'first', schemaVersion: 1 }),
      other = a.forTitle({ titleId: 'second', schemaVersion: 1 });
    const write = (service) =>
      service.write(
        'main',
        { schemaVersion: 1, bytes: new Uint8Array([7]) },
        null,
      );
    const attempts = await Promise.allSettled([write(one), write(two)]);
    await write(other);
    await one.reset();
    return {
      wins: attempts.filter((r) => r.status === 'fulfilled').length,
      conflicts: attempts.filter(
        (r) => r.status === 'rejected' && r.reason.code === 'conflict',
      ).length,
      other: (await other.read('main')).bytes[0],
      removed: await one.read('main'),
    };
  });
  expect(result).toEqual({ wins: 1, conflicts: 1, other: 7, removed: null });
});

test('blocked storage keeps guest play available and reports no persistence', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  await launchDemo(page, demo.url);
  await expect(
    page.frameLocator('iframe').locator('#save-status'),
  ).toContainText('Saves unavailable');
  await expect(page.locator('#runtime-overlay')).toBeHidden();
});
