import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
for (const accepted of [true, false])
  test(`native menu handoff requires acknowledgement: ${accepted}`, async ({
    page,
  }) => {
    const demo = await startCatalogDemo();
    try {
      await page.addInitScript((accepted) => {
        window.webkit = {
          messageHandlers: {
            akeruPlayer: {
              postMessage: async (value) =>
                value.action === 'menu' ? accepted : false,
            },
          },
        };
      }, accepted);
      await page.goto(demo.url + '/play/orbit-study');
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      if (accepted) {
        await expect(page.locator('#player-menu')).toBeHidden();
        await expect(page.locator('#touch-controls')).toBeHidden();
        expect(
          await page.evaluate(() => window.akeruNative.command('pause')),
        ).toBe('Paused');
        expect(
          await page.evaluate(() => window.akeruNative.command('resume')),
        ).toBe('Playing');
        expect(
          await page.evaluate(async () => {
            try {
              await window.akeruNative.command('anything');
              return false;
            } catch {
              return true;
            }
          }),
        ).toBe(true);
      } else {
        await expect(page.locator('#player-menu')).toBeVisible();
        expect(
          await page.evaluate(async () => {
            try {
              await window.akeruNative.command('pause');
              return false;
            } catch {
              return true;
            }
          }),
        ).toBe(true);
      }
    } finally {
      await demo.close();
    }
  });

test('native Doom menu saves a dated snapshot, restarts without deleting it, and toggles audio', async ({
  page,
}) => {
  test.setTimeout(60000);
  const { freedoomOptions } =
    await import('../../packages/freedoom/catalog.mjs');
  const demo = await startCatalogDemo(freedoomOptions());
  try {
    await page.addInitScript(() => {
      window.webkit = {
        messageHandlers: {
          akeruPlayer: { postMessage: async (v) => v.action === 'menu' },
        },
      };
      Object.defineProperty(navigator, 'audioSession', {
        value: { type: 'auto' },
        configurable: true,
      });
    });
    await page.route('**/title.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nwindow.doomTest=()=>({tic:engine?._akeru_tic(),state:audio?.state,muted,session:navigator.audioSession.type});',
      });
    });
    await page.goto(demo.url + '/play/freedoom1');
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 20000,
    });
    await expect(page.locator('#player-menu')).toBeHidden();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#enable-audio')).toBeHidden();
    await frame.locator('canvas').click();
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomTest().state),
      )
      .toBe('running');
    expect(
      await frame.locator('canvas').evaluate(() => window.doomTest().session),
    ).toBe('playback');
    const command = (action) =>
      page.evaluate((a) => window.akeruNative.command(a), action);
    await command('pause');
    // Pause autosaves asynchronously; wait until the host can service snapshot writes.
    await expect.poll(() => command('save-status')).toBe('No manual save yet.');
    await expect
      .poll(() => command('save'))
      .toBe('Snapshot saved on this device.');
    const savedTic = await frame
      .locator('canvas')
      .evaluate(() => window.doomTest().tic);
    const savedStatus = await command('save-status');
    expect(savedStatus).toMatch(/^Last saved /);
    expect(await command('audio-status')).toBe('Sound on.');
    expect(await command('audio')).toBe('Sound off.');
    await command('resume');
    await expect
      .poll(() =>
        frame.locator('canvas').evaluate(() => window.doomTest().state),
      )
      .toBe('suspended');
    await command('pause');
    expect(await command('audio')).toBe('Sound on.');
    expect(await command('restart')).toContain(
      'manual save is still available',
    );
    expect(await command('save-status')).toBe(savedStatus);
    expect(await command('restore')).toContain('restored');
    expect(
      await frame.locator('canvas').evaluate(() => window.doomTest().tic),
    ).toBe(savedTic);
    await page.reload();
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 20000,
    });
    await expect.poll(() => command('save-status')).toBe(savedStatus);
  } finally {
    await demo.close();
  }
});
