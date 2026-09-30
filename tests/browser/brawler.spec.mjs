import { existsSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { brawlerOptions } from '../../packages/brawler-coop/catalog.mjs';
test('Brawler exports, controller input, audio, pause and channel isolation', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/brawler-coop/build-record.json', import.meta.url),
    ),
    'Explicit creator export required',
  );
  test.setTimeout(90000);
  const demo = await startCatalogDemo(brawlerOptions());
  const engineErrors = [];
  page.on('console', (m) => {
    if (/SCRIPT ERROR|Parse Error|^ERROR:/.test(m.text()))
      engineErrors.push(m.text());
  });
  try {
    await page.addInitScript(() =>
      localStorage.setItem('akeru.onboarding.v1', 'complete'),
    );
    await installSimulatedGamepad(page);
    await page.addInitScript(() => {
      window.webkit = {
        messageHandlers: {
          akeruPlayer: { postMessage: async (m) => m.action === 'menu' },
        },
      };
    });
    await page.goto(demo.url + '/play/brawler-coop');
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 30000,
    });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    const state = () =>
      frame.evaluate(() => JSON.parse(window.akeruBrawler.read()));
    const command = (a) =>
      page.evaluate((a) => window.akeruNative.command(a, {}, 2), a);
    // A starts the focused native game menu, not an adapter-built menu.
    await setGamepadButton(page, 0, 1);
    await page.waitForTimeout(150);
    await setGamepadButton(page, 0, 0);
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect.poll(async () => (await state()).actions.move_right).toBe(1);
    await page.waitForTimeout(800);
    await setGamepadButton(page, 2, 1);
    await expect.poll(async () => (await state()).actions.attack).toBe(1);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    await command('pause');
    await expect.poll(async () => (await state()).paused).toBe(true);
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await page.waitForTimeout(100);
    expect((await state()).actions).toEqual({});
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    await command('resume');
    await expect.poll(async () => (await state()).paused).toBe(false);
    await frame.locator('canvas').click({ position: { x: 100, y: 100 } });
    await expect
      .poll(async () => (await command('audio-status')).state.audioState)
      .toBe('on');
    expect((await command('audio')).state.audioState).toBe('off');
    await frame.evaluate(() =>
      window.postMessage(
        {
          protocol: 'akeru.catalog.v1',
          nonce: new URLSearchParams(location.hash.slice(1)).get('nonce'),
          sequence: 999999,
          type: 'resume',
          payload: {},
        },
        '*',
      ),
    );
    expect((await command('audio-status')).state.audioState).toBe('off');
    expect((await command('audio')).state.audioState).toBe('on');
    await expect(command('save')).rejects.toThrow('Action unavailable');
    expect((await command('restart')).ok).toBe(true);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/brawler-gameplay.png' });
    expect(engineErrors).toEqual([]);
  } finally {
    await demo.close();
  }
});

test.describe('Brawler touch', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test('shared joystick and buttons deliver and release input', async ({
    page,
  }) => {
    test.skip(
      !existsSync(
        new URL('../../dist/brawler-coop/build-record.json', import.meta.url),
      ),
      'Explicit creator export required',
    );
    test.setTimeout(90000);
    const demo = await startCatalogDemo(brawlerOptions());
    try {
      await page.addInitScript(() =>
        localStorage.setItem('akeru.onboarding.v1', 'complete'),
      );
      await page.goto(demo.url + '/play/brawler-coop');
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 30000,
      });
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await frame.locator('canvas').focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(
          () => frame.evaluate(() => window.akeruBrawler.status().playing),
          { timeout: 15000 },
        )
        .toBe(true);
      await expect(page.locator('#touch-controls')).toBeVisible();
      const pad = page.getByLabel('left thumbstick', { exact: true });
      const box = await pad.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
      await expect
        .poll(() =>
          frame.evaluate(
            () => JSON.parse(window.akeruBrawler.read()).actions.move_right,
          ),
        )
        .toBeGreaterThan(0.3);
      await page.mouse.up();
      await expect
        .poll(() =>
          frame.evaluate(
            () => JSON.parse(window.akeruBrawler.read()).actions.move_right,
          ),
        )
        .toBe(0);
    } finally {
      await demo.close();
    }
  });
});

test('Brawler phone rotation preserves native pause and controller gameplay', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/brawler-coop/build-record.json', import.meta.url),
    ),
    'Explicit creator export required',
  );
  test.setTimeout(90000);
  const demo = await startCatalogDemo(brawlerOptions());
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await installSimulatedGamepad(page);
    await page.addInitScript(() => {
      window.webkit = {
        messageHandlers: {
          akeruPlayer: { postMessage: async (m) => m.action === 'menu' },
        },
      };
    });
    await page.goto(demo.url + '/play/brawler-coop');
    await expect(page.locator('iframe')).toBeVisible();
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await expect(frame.locator('#rotate')).toBeVisible();
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 30000,
    });
    await page.screenshot({ path: '/tmp/brawler-mobile-portrait.png' });
    const state = () =>
      frame.evaluate(() => JSON.parse(window.akeruBrawler.read()));
    const status = () => frame.evaluate(() => window.akeruBrawler.status());
    const command = (a) =>
      page.evaluate((a) => window.akeruNative.command(a, {}, 2), a);
    expect((await state()).paused).toBe(true);
    await command('pause');
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(frame.locator('#rotate')).toBeHidden();
    expect((await state()).paused).toBe(true); // Rotation cannot dismiss the native menu.
    await command('resume');
    await expect.poll(async () => (await state()).paused).toBe(false);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/brawler-mobile-menu.png' });
    await setGamepadButton(page, 0, 1);
    await page.waitForTimeout(150);
    await setGamepadButton(page, 0, 0);
    await expect
      .poll(async () => (await status()).playing, { timeout: 15000 })
      .toBe(true);
    const start = (await status()).positions['1'][0];
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect
      .poll(async () => (await status()).positions['1'][0])
      .toBeGreaterThan(start + 20);
    await page.evaluate(() => window.__akeruTestGamepad.neutral());
    // Trigger combat and native-pause input suppression use the same game actions.
    await page.evaluate(() =>
      window.akeruNative.command('input', { rightTrigger: 255 }, 2),
    );
    await expect.poll(async () => (await state()).actions.attack).toBe(1);
    await page.evaluate(() => window.akeruNative.command('input', {}, 2));
    await frame.locator('canvas').click({ position: { x: 20, y: 160 } });
    await expect
      .poll(async () => (await command('audio-status')).state.audioState)
      .toBe('on');
    await command('pause');
    expect((await command('audio')).state.audioState).toBe('off');
    expect((await command('audio')).state.audioState).toBe('on');
    const reply = await command('restart');
    expect(reply.ok).toBe(true);
    expect(reply.state).toEqual({}); // Required by AkeruCommandReply in iOS.
    await command('resume');
    await page.screenshot({ path: '/tmp/brawler-mobile-landscape.png' });
  } finally {
    await demo.close();
  }
});
