import { existsSync, readFileSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { createRelay } from '../../packages/brawler-coop/server/relay.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { brawlerOptions } from '../../packages/brawler-coop/catalog.mjs';
const built = new URL(
  '../../dist/brawler-coop/build-record.json',
  import.meta.url,
);
test('Brawler two-player room, replicated movement, online pause, restart and disconnect', async ({
  browser,
}) => {
  const publicOrigin = process.env.BRAWLER_TEST_ORIGIN;
  test.skip(
    !publicOrigin &&
      (!existsSync(built) ||
        !JSON.parse(readFileSync(built)).relayUrl?.startsWith(
          'ws://127.0.0.1:',
        )),
    'Explicit loopback co-op build required',
  );
  test.setTimeout(240000);
  let relay, demo;
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (url.protocol !== 'https:' || url.origin !== publicOrigin)
      throw new Error('Expected an explicit HTTPS test origin');
    demo = { url: publicOrigin, close: async () => {} };
  } else {
    const origins = [];
    relay = createRelay({ origins });
    const endpoint = new URL(JSON.parse(readFileSync(built)).relayUrl);
    await new Promise((r) =>
      relay.server.listen(Number(endpoint.port), '127.0.0.1', r),
    );
    demo = await startCatalogDemo(brawlerOptions());
    origins.push(
      (await (await fetch(demo.url + '/catalog.json')).json()).entries[0]
        .release.origin,
    );
  }
  const pages = [],
    frames = [],
    errors = [];
  const state = (i) => frames[i].evaluate(() => window.akeruBrawler.status());
  const command = (i, action) =>
    pages[i].evaluate((a) => window.akeruNative.command(a, {}, 2), action);
  try {
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage({
        viewport: i
          ? { width: 844, height: 390 }
          : { width: 1280, height: 720 },
      });
      pages.push(page);
      await page.addInitScript(() =>
        localStorage.setItem('akeru.onboarding.v1', 'complete'),
      );
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error' || /SCRIPT ERROR|^ERROR:/.test(m.text()))
          errors.push(m.text());
      });
      await installSimulatedGamepad(page);
      await page.addInitScript(() => {
        window.webkit = {
          messageHandlers: {
            akeruPlayer: { postMessage: async (m) => m.action === 'menu' },
          },
        };
      });
      await page.goto(demo.url + '/play/brawler-coop');
      await page.locator('iframe').waitFor();
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 60000,
      });
      frames.push(page.frames().find((f) => f !== page.mainFrame()));
      await frames[i].locator('canvas').focus();
      await setGamepadButton(page, 13, 1);
      await page.waitForTimeout(100);
      await setGamepadButton(page, 13, 0);
      await setGamepadButton(page, 0, 1);
      await page.waitForTimeout(100);
      await setGamepadButton(page, 0, 0);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `/tmp/brawler-lobby-${i}.png` });
    }
    // Finish both cold downloads before opening a room. These contexts share a
    // browser process; a backgrounded rendering surface can suspend its poll.
    await frames[0].locator('canvas').focus();
    await pages[0].keyboard.press('Enter');
    await expect
      .poll(async () => (await state(0)).room, { timeout: 20000 })
      .toMatch(/^[A-Z2-9]{6}$/);
    await frames[1].locator('canvas').focus();
    await pages[1].keyboard.press('Shift+Tab');
    await pages[1].keyboard.type((await state(0)).room);
    await pages[1].keyboard.press('Tab');
    await pages[1].keyboard.press('Tab');
    await pages[1].keyboard.press('Enter');
    await expect
      .poll(async () => Object.keys((await state(1)).players ?? {}).length, {
        timeout: 15000,
      })
      .toBe(2);
    await pages[0].screenshot({ path: '/tmp/brawler-room-host.png' });
    await pages[1].screenshot({ path: '/tmp/brawler-room-mobile.png' });
    await pages[0].keyboard.press('Enter');
    for (let i = 0; i < 2; i++)
      await expect
        .poll(
          async () => Object.keys((await state(i)).positions ?? {}).length,
          { timeout: 15000 },
        )
        .toBe(2);
    const before = (await state(0)).positions['2'][0];
    await command(0, 'pause');
    await pages[1].evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect
      .poll(async () => (await state(0)).positions['2'][0])
      .toBeGreaterThan(before + 20);
    await pages[1].evaluate(() => window.__akeruTestGamepad.neutral());
    await expect
      .poll(async () =>
        Math.abs(
          (await state(0)).positions['2'][0] -
            (await state(1)).positions['2'][0],
        ),
      )
      .toBeLessThan(10);
    await command(0, 'resume');
    // Let the encounter spawn enemies before testing coordinated teardown.
    await pages[0].waitForTimeout(3500);
    await expect(command(1, 'restart')).rejects.toThrow('Action unavailable');
    expect((await command(0, 'restart')).ok).toBe(true);
    for (let i = 0; i < 2; i++)
      await expect
        .poll(async () => (await state(i)).positions['2']?.[0], {
          timeout: 15000,
        })
        .toBeLessThan(before + 20);
    await pages[1].evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect
      .poll(async () => (await state(0)).positions['2'][0])
      .toBeGreaterThan(before + 20);
    await pages[1].evaluate(() => window.__akeruTestGamepad.neutral());
    await pages[1].screenshot({ path: '/tmp/brawler-coop-mobile.png' });
    await pages[0].close();
    await expect
      .poll(async () => (await state(1)).online, { timeout: 10000 })
      .toBe(false);
    await expect
      .poll(async () => (await state(1)).playing, { timeout: 10000 })
      .toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
    await demo.close();
    await relay?.close();
  }
});
