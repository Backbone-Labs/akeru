import { existsSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { creatorTitles } from '../../packages/creator-preview/titles.mjs';
const built = ['westwick-manor', 'mythic-kitchen'].every((id) =>
  existsSync(new URL(`../../dist/${id}/build-record.json`, import.meta.url)),
);
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(160);
};
for (const [id, handle] of [
  ['westwick-manor', 'ww'],
  ['mythic-kitchen', 'mk'],
]) {
  test(`${id}: controller menus, gameplay, pause, disconnect and host saves`, async ({
    page,
  }) => {
    test.skip(!built, 'Explicit private creator source build required');
    test.setTimeout(90000);
    const demo = await startCatalogDemo({ titles: creatorTitles() });
    try {
      await installSimulatedGamepad(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(demo.url + '/play/' + id);
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 20000,
      });
      const frame = page.frames().find((f) => f !== page.mainFrame());
      const state = () =>
        frame.evaluate(
          (h) => ({
            screen: window[h].ui.screen,
            playing: window[h].inGame(),
            chef: window[h].activeChef,
            x: window[h].state?.players?.[0]?.x,
            y: window[h].state?.players?.[0]?.y,
            tick: window[h].state?.tick,
            controls: window.akeruCreator.controls,
          }),
          handle,
        );
      await press(page, 0);
      await expect.poll(async () => (await state()).screen).toBe('menu');
      await press(page, 0);
      await expect
        .poll(async () => (await state()).screen)
        .toBe(id === 'westwick-manor' ? 'heroes' : 'levels');
      if (id === 'westwick-manor') {
        await press(page, 13);
      }
      await press(page, 0);
      await expect.poll(async () => (await state()).playing).toBe(true);
      if (id === 'mythic-kitchen')
        await expect
          .poll(() => frame.evaluate(() => window.mk.state.phase), {
            timeout: 10000,
          })
          .toBe('playing');
      const before = await state();
      await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
      await page.waitForTimeout(600);
      await page.evaluate(() => window.__akeruTestGamepad.neutral());
      await expect
        .poll(async () =>
          Math.hypot(
            (await state()).x - before.x,
            (await state()).y - before.y,
          ),
        )
        .toBeGreaterThan(0.1);
      if (id === 'mythic-kitchen') {
        await press(page, 3);
        await expect.poll(async () => (await state()).chef).toBe(1);
      } else {
        await page.evaluate(() => window.__akeruTestGamepad.axis(2, 1));
        await page.waitForTimeout(120);
        await expect
          .poll(() => frame.evaluate(() => window.ww.akeruAim?.x))
          .toBeGreaterThan(0.8);
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
      }
      await setGamepadButton(page, 7, 1);
      await expect
        .poll(async () => (await state()).controls.buttons.rightTrigger)
        .toBe(1);
      await setGamepadButton(page, 7, 0);
      await press(page, 9);
      await expect(page.locator('#runtime-overlay')).toBeVisible();
      const paused = await state();
      await page.waitForTimeout(250);
      expect((await state()).tick).toBe(paused.tick);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
      await page.waitForTimeout(100);
      await page.evaluate(() => window.__akeruTestGamepad.connect(false));
      await expect
        .poll(async () => (await state()).controls.axes.moveX ?? 0)
        .toBe(0);
      // Isolated title code cannot turn a forged message into host input.
      await frame.evaluate(() =>
        window.postMessage(
          {
            protocol: 'akeru.catalog.v1',
            nonce: 'wrong',
            sequence: 99999,
            type: 'input',
            payload: { axes: { moveX: 1 } },
          },
          '*',
        ),
      );
      expect((await state()).controls.axes.moveX ?? 0).toBe(0);
      const checkpoint =
        id === 'westwick-manor'
          ? await frame.evaluate(() => ({
              seed: window.ww.sim.seed,
              floorSeed: window.ww.state.floorSeed,
              floorIndex: window.ww.state.floorIndex,
            }))
          : null;
      await page.waitForTimeout(1300);
      await page.reload();
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 20000,
      });
      const again = page.frames().find((f) => f !== page.mainFrame());
      if (id === 'westwick-manor') {
        expect(await again.evaluate(() => window.ww.ui.saveAvailable)).toBe(
          true,
        );
        const saved = await again.evaluate(() =>
          JSON.parse(window.akeruCreator.storage.getItem('ww_save')),
        );
        expect(saved.seed).toBe(checkpoint.seed);
        await again.evaluate(() => window.ww.continueSolo());
        await expect
          .poll(() => again.evaluate(() => window.ww.state?.floorSeed))
          .toBe(checkpoint.floorSeed);
        expect(await again.evaluate(() => window.ww.state.floorIndex)).toBe(
          checkpoint.floorIndex,
        );
      } else {
        await again.evaluate(() =>
          window.mk.ui.setProgress(window.mk.ui.levels[0].id, 2),
        );
        await page.waitForTimeout(1300);
        await page.reload();
        await expect(page.locator('#runtime-overlay')).toBeHidden({
          timeout: 20000,
        });
        const f = page.frames().find((f) => f !== page.mainFrame());
        expect(
          await f.evaluate(() =>
            Object.values(window.mk.ui.getProgress()).includes(2),
          ),
        ).toBe(true);
      }
    } finally {
      await demo.close();
    }
  });
}

for (const [id, handle, portKey, character] of [
  ['westwick-manor', 'ww', 'AKERU_MANOR_SERVER_PORT', 'marlow'],
  ['mythic-kitchen', 'mk', 'AKERU_KITCHEN_SERVER_PORT', 'dragon'],
]) {
  test(`${id}: two real clients join a lobby and controller-ready into a shared game`, async ({
    page,
    browser,
  }) => {
    test.skip(
      !built || !process.env[portKey],
      'Opt-in local creator multiplayer servers required',
    );
    test.setTimeout(90000);
    const { createLocalNetwork } =
      await import('../../packages/creator-preview/local-network.mjs');
    const options = creatorTitles().find((t) => t.manifest.id === id);
    options.upgrade = createLocalNetwork(Number(process.env[portKey]));
    const demo = await startCatalogDemo({ titles: [options] });
    const guest = await browser.newPage();
    try {
      for (const p of [page, guest]) {
        await installSimulatedGamepad(p);
        await p.emulateMedia({ reducedMotion: 'reduce' });
        await p.goto(demo.url + '/play/' + id);
        await expect(p.locator('#runtime-overlay')).toBeHidden({
          timeout: 20000,
        });
      }
      const host = page.frames().find((f) => f !== page.mainFrame()),
        other = guest.frames().find((f) => f !== guest.mainFrame());
      await host.evaluate(
        async ({ handle, character }) => {
          window[handle].ui.show('online');
          await window[handle].hostOnline('Host', character);
        },
        { handle, character },
      );
      await expect
        .poll(() => host.evaluate((h) => window[h].lobby?.code, handle))
        .toBeTruthy();
      const code = await host.evaluate((h) => window[h].lobby.code, handle);
      await other.evaluate(
        async ({ handle, character, code }) => {
          window[handle].ui.show('online');
          await window[handle].joinOnline(code, 'Guest', character);
        },
        { handle, character, code },
      );
      await expect
        .poll(() =>
          host.evaluate((h) => window[h].lobby?.players.length, handle),
        )
        .toBe(2);
      for (const [p, f] of [
        [page, host],
        [guest, other],
      ]) {
        await f.locator('[data-act=ready]').focus();
        await press(p, 0);
      }
      await expect(host.locator('[data-act=start]')).toBeEnabled();
      await host.locator('[data-act=start]').focus();
      await press(page, 0);
      await expect
        .poll(() => other.evaluate((h) => window[h].inGame(), handle), {
          timeout: 20000,
        })
        .toBe(true);
      await expect
        .poll(() =>
          host.evaluate((h) => window[h].state?.players.length, handle),
        )
        .toBe(2);
      if (id === 'mythic-kitchen')
        await expect
          .poll(() => host.evaluate(() => window.mk.state.phase), {
            timeout: 10000,
          })
          .toBe('playing');
      const guestId = await other.evaluate(
        (h) => window[h].net.localPlayerId,
        handle,
      );
      const pos = () =>
        host.evaluate(
          ({ h, id }) => {
            const p = window[h].state.players.find((p) => p.id === id);
            return { x: p.x, y: p.y };
          },
          { h: handle, id: guestId },
        );
      const before = await pos();
      await guest.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
      await guest.waitForTimeout(600);
      await guest.evaluate(() => window.__akeruTestGamepad.neutral());
      await expect
        .poll(async () => {
          const p = await pos();
          return Math.hypot(p.x - before.x, p.y - before.y);
        })
        .toBeGreaterThan(0.1);
      await press(page, 9);
      await expect(page.locator('#runtime-overlay')).toBeVisible();
      const guestTick = await other.evaluate(
        (h) => window[h].state.tick,
        handle,
      );
      await guest.waitForTimeout(250);
      expect(
        await other.evaluate((h) => window[h].state.tick, handle),
      ).toBeGreaterThan(guestTick);
    } finally {
      await guest.close();
      await page.goto('about:blank');
      await demo.close();
    }
  });
}

test.describe('creator touch controls', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  for (const [id, handle] of [
    ['westwick-manor', 'ww'],
    ['mythic-kitchen', 'mk'],
  ])
    test(`${id}: touch menus and analog movement`, async ({ page }) => {
      test.skip(!built, 'Explicit private creator source build required');
      test.setTimeout(90000);
      const demo = await startCatalogDemo({ titles: creatorTitles() });
      try {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(demo.url + '/play/' + id);
        await expect(page.locator('#runtime-overlay')).toBeHidden({
          timeout: 20000,
        });
        const f = page.frames().find((x) => x !== page.mainFrame());
        await f.locator('[data-screen=title]').tap();
        await expect
          .poll(() => f.evaluate((h) => window[h].ui.screen, handle))
          .toBe('menu');
        if (id === 'westwick-manor') {
          await f.locator('[data-act=new]').tap();
          await f.locator('[data-act=begin]').tap();
        } else {
          await f.locator('[data-act=single]').tap();
          await f.locator('.level-tile:not(.locked)').first().tap();
          await expect
            .poll(() => f.evaluate(() => window.mk.state.phase), {
              timeout: 10000,
            })
            .toBe('playing');
        }
        await expect
          .poll(() => f.evaluate((h) => window[h].inGame(), handle))
          .toBe(true);
        await expect(page.locator('#touch-controls')).toBeVisible();
        const before = await f.evaluate(
          (h) => ({
            x: window[h].state.players[0].x,
            y: window[h].state.players[0].y,
          }),
          handle,
        );
        const pad = page.getByLabel('left thumbstick', { exact: true });
        const box = await pad.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
        await page.waitForTimeout(600);
        await page.mouse.up();
        await expect
          .poll(() =>
            f.evaluate(
              ({ h, p }) =>
                Math.hypot(
                  window[h].state.players[0].x - p.x,
                  window[h].state.players[0].y - p.y,
                ),
              { h: handle, p: before },
            ),
          )
          .toBeGreaterThan(0.1);
        await expect
          .poll(() =>
            f.evaluate(() => window.akeruCreator.controls.axes.moveX ?? 0),
          )
          .toBe(0);
      } finally {
        await demo.close();
      }
    });
});
