import { existsSync, mkdirSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/standstill/catalog.mjs';
const built = existsSync(
  new URL('../../dist/standstill/build-record.json', import.meta.url),
);
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(120);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(400);
};
const frame = (page) => page.frames().find((f) => f !== page.mainFrame());
async function launch(page, demo) {
  await page.goto(demo.url + '/play/standstill');
  await expect(page.locator('#runtime-overlay')).toBeHidden({ timeout: 20000 });
  const f = frame(page);
  await expect.poll(() => f.evaluate(() => window.ss.ui.screen)).toBe('title');
  return f;
}

test('Standstill native controller tutorial, gameplay, pause, disconnect and guest progress', async ({
  page,
}) => {
  test.skip(!built, 'Private creator build required');
  test.setTimeout(120000);
  const demo = await startCatalogDemo({ titles: [options()] });
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installSimulatedGamepad(page);
    const f = await launch(page, demo);
    await press(page, 0);
    await expect.poll(() => f.evaluate(() => window.ss.ui.screen)).toBe('menu');
    // Navigate to Tutorial through the real game's list with the D-pad.
    await press(page, 13);
    await press(page, 13);
    await press(page, 13);
    await press(page, 0);
    await expect(f.locator('.ss-tut__title')).toHaveText('YOUR CONTROLLER.');
    await expect(f.locator('.ss-tut__pip')).toHaveCount(9);
    await press(page, 5);
    await expect(f.locator('.ss-tut__title')).toHaveText('STOP. THINK. ACT.');
    await press(page, 4);
    await expect(f.locator('.ss-tut__title')).toHaveText('YOUR CONTROLLER.');
    await setGamepadButton(page, 5, 1);
    await page.waitForTimeout(700);
    await expect
      .poll(() => f.evaluate(() => window.ss.ui.current.page))
      .toBe(1);
    await setGamepadButton(page, 5, 0);
    mkdirSync('dist/tutorial-previews', { recursive: true });
    await page.screenshot({
      path: 'dist/tutorial-previews/standstill-desktop.png',
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'dist/tutorial-previews/standstill-landscape.png',
    });
    const bounds = await f.locator('.creator-control-plate').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(391);
    await page.setViewportSize({ width: 1280, height: 720 });
    await press(page, 1);
    await expect.poll(() => f.evaluate(() => window.ss.ui.screen)).toBe('menu');
    await f.locator('.ss-list__row[data-id=play]').click();
    await expect.poll(() => f.evaluate(() => window.ss.playing())).toBeTruthy();
    const state = () =>
      f.evaluate(() => ({
        pos: [...window.ss.sim.state.player.pos],
        yaw: window.ss.sim.state.player.yaw,
        tick: window.ss.sim.state.tick,
        scale: window.ss.sim.state.timeScale,
        phase: window.ss.sim.state.phase,
        controls: window.akeruCreator.controls,
      }));
    const before = await state();
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 0.8));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    const moved = await state();
    expect(
      Math.hypot(...moved.pos.map((x, i) => x - before.pos[i])),
    ).toBeGreaterThan(0.05);
    expect(moved.scale).toBeGreaterThan(before.scale);
    await page.evaluate(() => window.__akeruTestGamepad.axis(2, 0.6));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    expect(Math.abs((await state()).yaw - moved.yaw)).toBeGreaterThan(0.05);
    // B opens the game's pause menu; tutorial is also reachable during a level.
    await press(page, 1);
    await expect.poll(() => f.evaluate(() => window.ss.paused)).toBe(true);
    const stopped = (await state()).tick;
    await f.locator('.ss-pause [data-id=tutorial]').click();
    await expect(f.locator('.ss-tut__title')).toBeVisible();
    await press(page, 5);
    expect((await state()).tick).toBe(stopped);
    await press(page, 1);
    await expect
      .poll(() => f.evaluate(() => Boolean(window.ss.ui.overlay)))
      .toBe(false);
    await press(page, 1);
    await expect.poll(() => f.evaluate(() => window.ss.paused)).toBe(false);
    await press(page, 9);
    await expect(page.locator('#runtime-overlay')).toBeVisible();
    const hostPaused = (await state()).tick;
    await page.waitForTimeout(250);
    expect((await state()).tick).toBe(hostPaused);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.evaluate(() => {
      window.__akeruTestGamepad.axis(0, 1);
      window.__akeruTestGamepad.button(7, 1);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__akeruTestGamepad.connect(false));
    await expect
      .poll(async () => (await state()).controls.axes.moveX ?? 0)
      .toBe(0);
    await expect
      .poll(async () => (await state()).controls.buttons.rightTrigger ?? 0)
      .toBe(0);
    await f.evaluate(() =>
      window.postMessage(
        {
          protocol: 'akeru.catalog.v1',
          nonce: 'wrong',
          sequence: 999999,
          type: 'input',
          payload: { axes: { moveX: 1 } },
        },
        '*',
      ),
    );
    expect((await state()).controls.axes.moveX ?? 0).toBe(0);
    // Use the game's progression writer, then verify the host hydrates the same save.
    await f.evaluate(() => {
      const g = window.ss;
      const s = g.ui.getSave();
      s.unlocked = 2;
      s.settings.sensitivity = 1.25;
      g.ui.setSave(s);
    });
    await page.waitForTimeout(1400);
    await page.reload();
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 20000,
    });
    const saved = await frame(page).evaluate(() => window.ss.ui.getSave());
    expect(saved.unlocked).toBe(2);
    expect(saved.settings.sensitivity).toBe(1.25);
    expect(saved.tutorialSeen).toBeTruthy();
  } finally {
    await demo.close();
  }
});

test.describe('Standstill touch', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test('native tutorial fits landscape and touch moves, aims and jumps', async ({
    page,
  }) => {
    test.skip(!built, 'Private creator build required');
    test.setTimeout(90000);
    const demo = await startCatalogDemo({ titles: [options()] });
    try {
      const f = await launch(page, demo);
      await f.locator('.ss-title').tap();
      await f.locator('.ss-list__row[data-id=tutorial]').tap();
      await expect(page.locator('#touch-controls')).toBeHidden();
      await expect(f.locator('.ss-tut__title')).toHaveText('YOUR CONTROLLER.');
      await page.waitForTimeout(1300);
      mkdirSync('dist/tutorial-previews', { recursive: true });
      await page.screenshot({
        path: 'dist/tutorial-previews/standstill-first-landscape.png',
      });
      await f.locator('.ss-tut__pip').nth(1).tap();
      await page.waitForTimeout(1300);
      const notes = await f.locator('.ss-tut__notes').boundingBox();
      const footer = await f.locator('.ss-tut__panel .ss-foot').boundingBox();
      expect(notes.y + notes.height).toBeLessThan(footer.y);
      await page.screenshot({
        path: 'dist/tutorial-previews/standstill-second-landscape.png',
      });
      await f.locator('body').press('Escape');
      await f.locator('.ss-list__row[data-id=play]').tap();
      await expect
        .poll(() => f.evaluate(() => window.ss.playing()))
        .toBeTruthy();
      await expect(page.locator('#touch-controls')).toBeVisible();
      const before = await f.evaluate(() => ({
        pos: [...window.ss.sim.state.player.pos],
        yaw: window.ss.sim.state.player.yaw,
      }));
      async function dragStick(label) {
        const box = await page.getByLabel(label, { exact: true }).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
        await page.waitForTimeout(350);
        await page.mouse.up();
      }
      await dragStick('left thumbstick');
      const moved = await f.evaluate(() => window.ss.sim.state.player.pos);
      expect(
        Math.hypot(...moved.map((x, i) => x - before.pos[i])),
      ).toBeGreaterThan(0.05);
      await dragStick('right thumbstick');
      expect(
        Math.abs(
          (await f.evaluate(() => window.ss.sim.state.player.yaw)) - before.yaw,
        ),
      ).toBeGreaterThan(0.05);
      await expect
        .poll(() =>
          f.evaluate(() => window.akeruCreator.controls.axes.lookX ?? 0),
        )
        .toBe(0);
      const jump = page.locator('#touch-controls [data-control=south]');
      await jump.tap();
      await expect
        .poll(() => f.evaluate(() => window.ss.sim.state.player.pos[1]))
        .toBeGreaterThan(0.1);
      mkdirSync('dist/previews', { recursive: true });
      await f
        .locator('#game-canvas')
        .screenshot({ path: 'dist/previews/standstill.png' });
    } finally {
      await demo.close();
    }
  });
});
