import { existsSync } from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options as kitchen } from '../../packages/mythic-kitchen/catalog.mjs';
import { options as standstill } from '../../packages/standstill/catalog.mjs';
for (const [id, options, handle] of [
  ['mythic-kitchen', kitchen, 'mk'],
  ['standstill', standstill, 'ss'],
]) {
  test(`${id}: native pill saves, mute and pause through the authenticated title channel`, async ({
    page,
  }) => {
    test.skip(
      !existsSync(
        new URL(`../../dist/${id}/build-record.json`, import.meta.url),
      ),
      'Explicit creator build required',
    );
    test.setTimeout(90000);
    const demo = await startCatalogDemo({ titles: [options()] });
    try {
      await page.addInitScript(() => {
        window.webkit = {
          messageHandlers: {
            akeruPlayer: {
              postMessage: async (message) => message.action === 'menu',
            },
          },
        };
      });
      await page.goto(demo.url + '/play/' + id);
      await expect(page.locator('#runtime-overlay')).toBeHidden({
        timeout: 25000,
      });
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await expect
        .poll(() => frame.evaluate((h) => Boolean(window[h]), handle))
        .toBe(true);
      const command = (action) =>
        page.evaluate((a) => window.akeruNative.command(a, {}, 2), action);
      await expect
        .poll(async () => (await command('save-status')).ok)
        .toBe(true);
      const saved = await command('save');
      expect(saved.ok).toBe(true);
      expect(saved.state.hasManualSave).toBe(false);
      expect((await command('restore')).ok).toBe(false);
      await command('pause');
      expect(await frame.evaluate(() => window.akeruCreator.paused)).toBe(true);
      await page.evaluate(() =>
        window.akeruNative.command(
          'input',
          { leftTrigger: 255, rightTrigger: 255, buttons: 1 },
          2,
        ),
      );
      expect(
        await frame.evaluate(
          () => window.akeruCreator.controls.buttons.confirm ?? 0,
        ),
      ).toBe(0);
      await command('resume');
      await page.evaluate(() =>
        window.akeruNative.command(
          'input',
          { leftTrigger: 255, rightTrigger: 255 },
          2,
        ),
      );
      await expect
        .poll(() =>
          frame.evaluate(
            () => window.akeruCreator.controls.buttons.leftTrigger,
          ),
        )
        .toBe(1);
      await page.evaluate(() => window.akeruNative.command('input', {}, 2));
      await frame.evaluate((h) => window[h].sfx.setEnabled(false), handle);
      const audio = await command('audio-status');
      expect(audio.state.audioState).toBe('off');
      // A frame impersonating its parent cannot execute a native action.
      await frame.evaluate(() =>
        window.postMessage(
          {
            protocol: 'akeru.catalog.v1',
            nonce: new URLSearchParams(location.hash.slice(1)).get('nonce'),
            sequence: 999999,
            type: 'action',
            payload: { id: 99, action: 'audio' },
          },
          '*',
        ),
      );
      expect((await command('audio-status')).state.audioState).toBe('off');
    } finally {
      await demo.close();
    }
  });
}
