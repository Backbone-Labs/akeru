import { existsSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/standstill/catalog.mjs';

test('Standstill RT and RB cause real punches and shots, with visible controller and mouse hints', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/standstill/build-record.json', import.meta.url),
    ),
    'Creator build required',
  );
  test.setTimeout(90000);
  const demo = await startCatalogDemo({ titles: [options()] });
  try {
    await installSimulatedGamepad(page);
    await page.goto(demo.url + '/play/standstill');
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 25000,
    });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await expect
      .poll(() => frame.evaluate(() => window.ss.ui.screen))
      .toBe('title');
    const press = async (n) => {
      await setGamepadButton(page, n, 1);
      await page.waitForTimeout(120);
      await setGamepadButton(page, n, 0);
      await page.waitForTimeout(400);
    };
    await press(0);
    await expect
      .poll(() => frame.evaluate(() => window.ss.ui.screen))
      .toBe('menu');
    await press(0);
    await expect
      .poll(() =>
        frame.evaluate(() => window.ss.playing() && !window.ss.ui._owner()),
      )
      .toBe(true);
    await frame.evaluate(() => {
      window.ss.sim.invulnerable = true;
    });
    await expect(frame.locator('.ss-hud__whint')).toContainText(
      'RT / RB · LEFT CLICK — PUNCH',
    );
    for (const [button, value] of [
      [7, 0.3],
      [5, 1],
    ]) {
      await frame.evaluate(() => {
        const p = window.ss.sim.state.player;
        p.weapon = null;
        p.punchT = 0;
        p.fireCd = 0;
      });
      await setGamepadButton(page, button, value);
      await expect
        .poll(() => frame.evaluate(() => window.ss.sim.state.player.punchT))
        .toBeGreaterThan(0);
      await setGamepadButton(page, button, 0);
      await frame.evaluate(() => {
        const p = window.ss.sim.state.player;
        p.weapon = { kind: 'pistol', ammo: 5, id: 'combat-test' };
        p.punchT = 0;
        p.fireCd = 0;
      });
      await setGamepadButton(page, button, value);
      await expect
        .poll(() =>
          frame.evaluate(() => window.ss.sim.state.player.weapon.ammo),
        )
        .toBeLessThan(5);
      await setGamepadButton(page, button, 0);
      await expect(frame.locator('.ss-hud__whint')).toContainText(
        'LEFT CLICK — SHOOT',
      );
    }
  } finally {
    await demo.close();
  }
});
