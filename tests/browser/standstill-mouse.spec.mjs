import { existsSync } from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/standstill/catalog.mjs';

test('Standstill requests pointer lock, consumes unheld mouse motion and releases on pause', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/standstill/build-record.json', import.meta.url),
    ),
    'Private creator build required',
  );
  test.setTimeout(90000);
  const demo = await startCatalogDemo({ titles: [options()] });
  try {
    // Chromium's macOS automation window cannot reliably acquire OS mouse focus.
    // Model the browser API boundary; exercise the real request and game handlers.
    await page.addInitScript(() => {
      let locked = null;
      window.__mouseRequests = 0;
      Object.defineProperty(document, 'pointerLockElement', {
        get: () => locked,
      });
      Element.prototype.requestPointerLock = function () {
        window.__mouseRequests++;
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(demo.url + '/play/standstill');
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 20000,
    });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await expect
      .poll(() => frame.evaluate(() => window.ss?.ui.screen))
      .toBe('title');
    await page.bringToFront();
    await frame.locator('.ss-title__press').click();
    await frame.locator('.ss-list__row[data-id=play]').click();
    await expect
      .poll(() =>
        frame.evaluate(() => document.pointerLockElement === window.ss.canvas),
      )
      .toBe(true);
    expect(await frame.evaluate(() => window.__mouseRequests)).toBeGreaterThan(
      0,
    );
    const yaw = await frame.evaluate(() => window.ss.sim.state.player.yaw);
    // Real mousemove events with no button held must drive the camera.
    await frame.evaluate(() => {
      for (let i = 0; i < 12; i++)
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: 10,
            movementY: 2,
            buttons: 0,
          }),
        );
    });
    await expect
      .poll(() => frame.evaluate(() => window.ss.sim.state.player.yaw))
      .not.toBe(yaw);
    await page.keyboard.press('Escape');
    await expect
      .poll(() => frame.evaluate(() => document.pointerLockElement === null))
      .toBe(true);
    await expect.poll(() => frame.evaluate(() => window.ss.paused)).toBe(true);
  } finally {
    await demo.close();
  }
});
