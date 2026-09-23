import { existsSync } from 'node:fs';
import { test, expect, installSimulatedGamepad } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { freedoomOptions } from '../../packages/freedoom/catalog.mjs';
test('Doom direct player has audible samples, separate snapshot restore, and no bottom toolbar', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/freedoom1/build-record.json', import.meta.url),
    ),
    'Explicit upstream build required',
  );
  test.setTimeout(60000);
  await installSimulatedGamepad(page);
  await page.addInitScript(() => {
    window.rumbles = [];
    const original = navigator.getGamepads;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () =>
        original().map((p) => {
          p.vibrationActuator = {
            playEffect: async (_, e) => {
              window.rumbles.push(e);
              return 'complete';
            },
            reset: async () => {},
          };
          return p;
        }),
    });
  });
  const demo = await startCatalogDemo(freedoomOptions());
  try {
    await page.route('**/title.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nwindow.doomSuspend=()=>audio.suspend();window.doomState=()=>({tic:engine?._akeru_tic(),audio:audio?.state,peak:engine?Math.max(...engine.HEAPF32.subarray(engine._akeru_audio()/4,engine._akeru_audio()/4+engine._akeru_audio_count()*2).map(Math.abs)):0});',
      });
    });
    await page.goto(demo.url + '/play/freedoom1');
    const frame = page.frameLocator('iframe');
    await expect(page.locator('#player-menu')).toBeEnabled({ timeout: 20000 });
    await expect(frame.locator('#game-options')).toBeHidden();
    if (await frame.locator('#enable-audio').isVisible())
      await frame.locator('#enable-audio').click();
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomState().audio),
      )
      .toBe('running');
    await page.evaluate(() => window.__akeruTestGamepad.button(0, 1));
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomState().peak),
      )
      .toBeGreaterThan(0);
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    await page.locator('#player-menu').click();
    await page
      .getByRole('button', { name: 'Saved progress', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Save snapshot', exact: true })
      .click();
    await expect(page.locator('.player-save-state')).toContainText(
      'Snapshot saved',
    );
    const savedTic = await frame
      .locator('canvas')
      .evaluate(() => window.doomState().tic);
    await frame.locator('canvas').evaluate(() => window.doomSuspend());
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomState().audio),
      )
      .toBe('running');
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomState().tic),
      )
      .toBeGreaterThan(savedTic + 10);
    await page.locator('#player-menu').click();
    await page
      .getByRole('button', { name: 'Saved progress', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Restore snapshot', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm restore snapshot', exact: true })
      .click();
    await expect(page.locator('.player-save-state')).toContainText(
      'Saved game restored',
    );
    expect(
      await frame.locator('canvas').evaluate(() => window.doomState().tic),
    ).toBe(savedTic);
    await page
      .getByRole('button', { name: 'Sound and vibration', exact: true })
      .click();
    await page.getByRole('button', { name: 'Vibration', exact: true }).click();
    await page
      .getByRole('button', { name: 'Test vibration', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.rumbles.length))
      .toBeGreaterThan(0);
    await page
      .getByRole('button', { name: 'Saved progress', exact: true })
      .click();
    await expect(page.locator('.player-save-state p')).toBeVisible();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.reload();
    await expect(page.locator('#player-menu')).toBeEnabled({ timeout: 20000 });
    await expect(frame.locator('#status')).toContainText('Progress restored');
  } finally {
    await demo.close();
  }
});
