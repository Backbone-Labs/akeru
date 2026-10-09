import { existsSync } from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { creatorOptions } from '../../packages/creator-preview/catalog.mjs';
import {
  METADATA,
  titleConfig,
} from '../../scripts/package-bubblekick-release.mjs';
test('Bubblekick field choice updates playable stadium and survives rematch', async ({
  page,
}) => {
  test.skip(
    !existsSync(
      new URL('../../dist/bubblekick/build-record.json', import.meta.url),
    ),
    'Explicit title build required',
  );
  test.setTimeout(90000);
  await page.setViewportSize({ width: 852, height: 393 });
  const demo = await startCatalogDemo({
    titles: [
      creatorOptions('bubblekick', {
        ...METADATA,
        title: 'Bubble Kick',
        saveDescription: METADATA.privacy[0],
      }),
    ],
  });
  try {
    const csp = titleConfig(null)
      .headers.flatMap((r) => r.headers)
      .find((h) => h.key === 'Content-Security-Policy')
      .value.replace('https://backbone-akeru.vercel.app', demo.url);
    await page.route('**/releases/**', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': csp },
      });
    });
    await page.goto(demo.url + '/play/bubblekick');
    await expect(page.locator('#runtime-overlay')).toBeHidden({
      timeout: 45000,
    });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.evaluate(() => {
      const g = window.__bubblekick.game;
      g.seats = [{ dev: 'kb1', team: 0, char: 0, ready: true }];
      g.showMatchOptions();
    });
    const field = frame.locator('.opt').filter({ hasText: 'FIELD SIZE' });
    await expect(field).toContainText('STANDARD');
    await field.click();
    await expect(field).toContainText('LARGE');
    await page.screenshot({ path: '/tmp/bubblekick-field-options.png' });
    await frame.getByRole('button', { name: 'KICK OFF!', exact: true }).click();
    expect(
      await frame.evaluate(() => {
        const g = window.__bubblekick.game;
        return [
          g.session.world.field.halfLength,
          g.renderer.stadium.field.halfLength,
          g.session.view.field.halfWidth,
        ];
      }),
    ).toEqual([40, 40, 25]);
    await frame.evaluate(() => window.__bubblekick.game.restart());
    expect(
      await frame.evaluate(
        () => window.__bubblekick.game.session.world.field.halfLength,
      ),
    ).toBe(40);
    await page.screenshot({ path: '/tmp/bubblekick-large-field.png' });
    // Switching size without changing theme must rebuild the arena, including goals/stands.
    await frame.evaluate(() =>
      window.__bubblekick.game.startLocalMatch({
        settings: { fieldSize: 'standard', stadium: 0 },
        seats: [{ dev: 'kb1', team: 0, char: 0 }],
      }),
    );
    expect(
      await frame.evaluate(
        () => window.__bubblekick.game.renderer.stadium.field.halfLength,
      ),
    ).toBe(30);
    // Lobby uses the same familiar touch/controller option row; guests see host's selection.
    await frame.evaluate(() => {
      const g = window.__bubblekick.game;
      g.net = { id: 1, send: (m) => (window.fieldMessage = m) };
      g.room = {
        code: 'TEST',
        host: 1,
        settings: { minutes: 3, bots: true, fieldSize: 'standard' },
        members: [{ id: 1, name: 'Host', seats: [{ team: 0, char: 0 }] }],
      };
      g.showLobby();
    });
    await frame.locator('.opt').filter({ hasText: 'FIELD SIZE' }).click();
    expect(await frame.evaluate(() => window.fieldMessage.fieldSize)).toBe(
      'large',
    );
    await frame.evaluate(() => {
      const g = window.__bubblekick.game;
      g.room.settings.fieldSize = 'large';
      g.room.host = 2;
      g._renderLobby();
    });
    await expect(frame.locator('.rows')).toContainText('Large field');
    await expect(
      frame.locator('.opt').filter({ hasText: 'FIELD SIZE' }),
    ).toHaveCount(0);
  } finally {
    await demo.close();
  }
});
