import { existsSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/mythic-kitchen/catalog.mjs';
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(150);
};
for (const viewport of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Kitchen ${viewport.width}x${viewport.height}: menus fit, focus is visible, recipe follows real cooking`, async ({
    page,
  }) => {
    test.skip(
      !existsSync(
        new URL('../../dist/mythic-kitchen/build-record.json', import.meta.url),
      ),
      'Creator build required',
    );
    test.setTimeout(120000);
    const demo = await startCatalogDemo({ titles: [options()] });
    try {
      await page.setViewportSize(viewport);
      await installSimulatedGamepad(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        window.webkit = {
          messageHandlers: { akeruPlayer: { postMessage: async () => true } },
        };
      });
      await page.goto(demo.url + '/play/mythic-kitchen');
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 25000,
      });
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await press(page, 0);
      await expect(frame.locator('.menu-screen')).toHaveClass(/active/);
      const menu = await frame.locator('.menu-board').boundingBox();
      const controls = await frame.locator('.controls-sign').boundingBox();
      expect(menu.y).toBeGreaterThanOrEqual(0);
      expect(menu.y + menu.height).toBeLessThan(viewport.height);
      // The explanation board cannot cover the final menu button.
      expect(
        controls.x >= menu.x + menu.width || controls.y >= menu.y + menu.height,
      ).toBe(true);
      expect(
        await frame
          .locator('[data-act=single]')
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe('4px');
      await press(page, 13);
      await expect(frame.locator('[data-act=coop]')).toBeFocused();
      await press(page, 12);
      await press(page, 0);
      await expect(frame.locator('.level-tile:not(.locked)')).toBeFocused();
      const board = await frame.locator('.levels-board').boundingBox();
      expect(board.y).toBeGreaterThanOrEqual(0);
      expect(board.y + board.height).toBeLessThan(viewport.height);
      await press(page, 0);
      await expect
        .poll(() => frame.evaluate(() => window.mk.state?.phase), {
          timeout: 30000,
        })
        .toBe('playing');
      await expect(frame.locator('.kitchen-guide')).toContainText(
        'Pick up an onion',
      );
      const guide = await frame.locator('.kitchen-guide').boundingBox();
      const chips = await frame.locator('.chips-wrap').boundingBox();
      expect(guide.y + guide.height).toBeLessThan(chips.y);
      // Actual simulation actions, with positioning accelerated only for this test.
      const cook = await frame.evaluate(() => {
        const g = window.mk,
          sim = g.sim,
          p = sim.getPlayer('p1');
        const find = (type) => sim.tiles.find((t) => t.type === type);
        const face = (tile) => {
          if (tile.x === 0) {
            p.x = 1.05;
            p.y = tile.y + 0.5;
            p.angle = Math.PI;
          } else if (tile.x === sim.width - 1) {
            p.x = tile.x - 0.05;
            p.y = tile.y + 0.5;
            p.angle = 0;
          } else {
            p.x = tile.x + 0.5;
            p.y = tile.y + 1.05;
            p.angle = -Math.PI / 2;
          }
        };
        const tap = () => {
          sim.setInput('p1', { interact: true });
          sim.step();
          sim.setInput('p1', {});
          sim.step();
        };
        const snapshot = () => {
          g.state = sim.getState();
        };
        g.__testKitchen = { face, tap, find, snapshot };
        for (let i = 0; i < 3; i++) {
          face(find('crate'));
          tap();
          face(find('cutting'));
          tap();
          sim.setInput('p1', { action: true });
          for (let j = 0; j < 100; j++) sim.step();
          sim.setInput('p1', {});
          tap();
          face(find('stove'));
          tap();
        }
        snapshot();
        return find('stove').item;
      });
      expect(cook.contents).toHaveLength(3);
      expect(cook.state).toBe('cooking');
      await expect(frame.locator('.kitchen-guide')).toContainText(
        'Cooking automatically',
      );
      await frame.evaluate(() => {
        const g = window.mk,
          sim = g.sim,
          h = g.__testKitchen;
        for (let i = 0; i < 550; i++) sim.step();
        h.snapshot();
      });
      await expect(frame.locator('.kitchen-guide')).toContainText(
        'Get a clean plate',
      );
      await frame.evaluate(() => {
        const h = window.mk.__testKitchen;
        h.face(h.find('plates'));
        h.tap();
        h.snapshot();
      });
      await expect(frame.locator('.kitchen-guide')).toContainText(
        'Plate the soup',
      );
      await frame.evaluate(() => {
        const h = window.mk.__testKitchen;
        h.face(h.find('stove'));
        h.tap();
        h.snapshot();
      });
      await expect(frame.locator('.kitchen-guide')).toContainText(
        'Serve your soup',
      );
      await frame.evaluate(() => {
        const h = window.mk.__testKitchen;
        h.face(h.find('delivery'));
        h.tap();
        h.snapshot();
      });
      expect(await frame.evaluate(() => window.mk.state.delivered)).toBe(1);
      // Hold hint is visible during play at a raw onion, then disappears after chopping.
      await frame.evaluate(() => {
        const h = window.mk.__testKitchen;
        h.face(h.find('crate'));
        h.tap();
        h.face(h.find('cutting'));
        h.tap();
        h.snapshot();
      });
      await expect(frame.locator('.kitchen-action')).toContainText('Hold X');
      await setGamepadButton(page, 2, 1);
      await expect
        .poll(
          () =>
            frame.evaluate(
              () =>
                window.mk.state.tiles.find((t) => t.type === 'cutting').item
                  ?.state,
            ),
          { timeout: 10000 },
        )
        .toBe('chopped');
      await setGamepadButton(page, 2, 0);
      await expect(frame.locator('.kitchen-action')).toContainText('Pick up');
    } finally {
      await demo.close();
    }
  });
}
