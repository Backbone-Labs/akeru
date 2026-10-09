import { existsSync, mkdirSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { creatorTitles } from '../../packages/creator-preview/titles.mjs';
const press = async (page, button) => {
  await setGamepadButton(page, button, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, button, 0);
  await page.waitForTimeout(200);
};
for (const [id, handle] of [
  ['westwick-manor', 'ww'],
  ['mythic-kitchen', 'mk'],
]) {
  test(`${id}: in-game tutorial includes controller pages and controller paging`, async ({
    page,
  }) => {
    test.skip(
      !existsSync(
        new URL(`../../dist/${id}/build-record.json`, import.meta.url),
      ),
      'Private creator build required',
    );
    test.setTimeout(180000);
    const demo = await startCatalogDemo({ titles: creatorTitles() });
    try {
      await page.setViewportSize({ width: 1360, height: 900 });
      await installSimulatedGamepad(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(demo.url + '/play/' + id);
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 20000,
      });
      const f = page.frames().find((x) => x !== page.mainFrame());
      await press(page, 0);
      await f.locator('[data-screen="menu"] [data-act="tutorial"]').click();
      await expect
        .poll(() => f.evaluate((h) => window[h].ui._tutMode, handle))
        .toBeTruthy();
      const index = () =>
        f.evaluate((h) => window[h].ui.tutorial.index, handle);
      await expect.poll(index).toBe(0);
      await press(page, 0);
      await expect.poll(index).toBe(1);
      const plate = f.locator('.creator-control-plate');
      await expect(plate).toBeVisible();
      await expect(plate).toContainText('Left stick');
      await expect(plate).toContainText(
        id === 'westwick-manor' ? 'Aim your lantern' : 'Pick up / put down',
      );
      await page.waitForTimeout(700); // Let the native book-turn animation settle.
      mkdirSync('dist/tutorial-previews', { recursive: true });
      await page.screenshot({
        path: `dist/tutorial-previews/${id}-desktop.png`,
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      const b = await plate.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(844);
      expect(b.y + b.height).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: `dist/tutorial-previews/${id}-landscape.png`,
      });
      await press(page, 5);
      await expect.poll(index).toBe(2);
      await expect(plate).toContainText(
        id === 'westwick-manor' ? 'Use selected item' : 'Next tutorial page',
      );
      await press(page, 4);
      await expect.poll(index).toBe(1);
      // Holding a button must not skip several chapters.
      await setGamepadButton(page, 5, 1);
      await page.waitForTimeout(600);
      await expect.poll(index).toBe(2);
      await setGamepadButton(page, 5, 0);
      await f.locator('body').press('ArrowRight');
      await expect.poll(index).toBe(3);
      await expect(
        f.locator(id === 'westwick-manor' ? '.tut-title' : '.tut-step-title'),
      ).toContainText(/Keyboard/i);
      await press(page, 1);
      await expect
        .poll(() => f.evaluate((h) => window[h].ui.screen, handle))
        .toBe('menu');
      // Open the game's own pause tutorial during a real solo session.
      await page.setViewportSize({ width: 1360, height: 900 });
      if (id === 'westwick-manor') {
        await f.locator('[data-screen=menu] [data-act=new]').click();
        await f.locator('[data-screen=heroes] [data-act=begin]').click();
      } else {
        await f.locator('[data-screen=menu] [data-act=single]').click();
        await f.locator('.level-tile:not(.locked)').first().click();
      }
      await expect
        .poll(() => f.evaluate((h) => window[h].inGame(), handle))
        .toBe(true);
      await f.locator('body').press('Escape');
      await f
        .locator(
          id === 'westwick-manor'
            ? '.pause-layer [data-act=tutorial]'
            : '.pause-veil [data-act=tutorial]',
        )
        .click();
      await expect
        .poll(() => f.evaluate((h) => window[h].ui._tutMode, handle))
        .toBe(id === 'westwick-manor' ? 'pause' : 'overlay');
      // Kitchen remembers the last page; Manor reopens at the beginning.
      await f.evaluate((h) => window[h].ui.tutorial.go(1), handle);
      await expect(plate).toBeVisible();
      const before = await f.evaluate((h) => window[h].state.tick, handle);
      await press(page, 5);
      await expect.poll(index).toBe(2);
      expect(await f.evaluate((h) => window[h].state.tick, handle)).toBe(
        before,
      );
      await press(page, 1);
      await expect
        .poll(() => f.evaluate((h) => Boolean(window[h].ui._tutMode), handle))
        .toBe(false);
      await expect
        .poll(() =>
          f.evaluate(
            (h) => (h === 'ww' ? window[h].paused : window[h].ui.isPaused()),
            handle,
          ),
        )
        .toBe(true);
      await press(page, 1);
      await expect
        .poll(() => f.evaluate((h) => window[h].paused, handle))
        .toBe(false);
    } finally {
      await page.goto('about:blank');
      await demo.close();
    }
  });
}
