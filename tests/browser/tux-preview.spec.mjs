import { existsSync, mkdirSync } from 'node:fs';
import { test, expect, installSimulatedGamepad } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options as supertux } from '../../packages/supertux/catalog.mjs';
import { options as supertuxkart } from '../../packages/supertuxkart/catalog.mjs';
for (const [id, options] of Object.entries({ supertux, supertuxkart }))
  test(
    id +
      ' runs original assets in an isolated frame, pauses and restores host saves',
    async ({ page }) => {
      test.setTimeout(180000);
      test.skip(
        !existsSync(
          new URL(`../../dist/${id}/build-record.json`, import.meta.url),
        ),
        'Explicit pinned upstream acquisition/build required',
      );
      const demo = await startCatalogDemo(options());
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await installSimulatedGamepad(page);
        await page.goto(demo.url + '/g/' + id);
        await page.getByRole('button', { name: /Play now/ }).click();
        const runtime = page.frameLocator('iframe');
        await expect(runtime.locator('body')).toHaveAttribute(
          'data-ready',
          'true',
          { timeout: 60000 },
        );
        mkdirSync(new URL('../../dist/previews/', import.meta.url), {
          recursive: true,
        });
        await runtime
          .locator('canvas')
          .screenshot({
            path: new URL(`../../dist/previews/${id}.png`, import.meta.url)
              .pathname,
          });
        let frame = page.frames().find((f) => f !== page.mainFrame());
        expect(await frame.evaluate(() => crossOriginIsolated)).toBe(true);
        expect(
          await frame.evaluate(() => document.querySelector('canvas').width),
        ).toBeGreaterThan(300);
        // Observe the actual SDL keyboard transport fed by authenticated host input.
        await frame.evaluate(() => {
          window.__keys = [];
          document
            .querySelector('canvas')
            .addEventListener('keydown', (e) => window.__keys.push(e.keyCode));
        });
        await page.evaluate(() => window.__akeruTestGamepad.button(0, 1));
        await expect
          .poll(() => frame.evaluate(() => window.__keys.includes(32)))
          .toBe(true);
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
        if (id === 'supertux')
          await frame.evaluate(() =>
            window.Module.ccall('save_config', 'void', [], []),
          );
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(runtime.locator('body')).toHaveAttribute(
          'data-paused',
          'true',
        );
        expect(
          await frame.evaluate(
            () => window.Browser.mainLoop.scheduler === null,
          ),
        ).toBe(true);
        await expect(runtime.locator('#save-status')).toBeEmpty();
        const root =
          id === 'supertux'
            ? '/home/web_user/.local/share/supertux2'
            : '/home/web_user';
        const saved = await frame.evaluate(async (root) => {
          const { snapshot } = await import('./saves.js');
          return snapshot(window.FS, root);
        }, root);
        expect(saved.files.length).toBeGreaterThan(0);
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Exit', exact: true }).click();
        await page.getByRole('button', { name: /Play now/ }).click();
        await expect(runtime.locator('body')).toHaveAttribute(
          'data-ready',
          'true',
          { timeout: 60000 },
        );
        frame = page.frames().find((f) => f !== page.mainFrame());
        const restored = await frame.evaluate(async (root) => {
          const { snapshot } = await import('./saves.js');
          return snapshot(window.FS, root);
        }, root);
        // The complete original config is present after the previous runtime was destroyed.
        expect(
          restored.files.some((f) =>
            saved.files.some((s) => s.path === f.path && s.data === f.data),
          ),
        ).toBe(true);
        await expect(runtime.locator('#save-status')).toBeEmpty();
        expect(errors).toEqual([]);
      } finally {
        await demo.close();
      }
    },
  );
