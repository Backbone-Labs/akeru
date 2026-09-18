import { existsSync, mkdirSync } from 'node:fs';
import { test, expect, installSimulatedGamepad } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options as racer } from '../../packages/racer/catalog.mjs';
import { options as hexgl } from '../../packages/hexgl/catalog.mjs';
import { options as astray } from '../../packages/astray/catalog.mjs';
import { options as breaklock } from '../../packages/breaklock/catalog.mjs';
const titles = { racer, hexgl, astray, breaklock };
async function launch(page, demo, id) {
  await page.goto(`${demo.url}/g/${id}`);
  await page.getByRole('button', { name: /Play now/ }).click();
  await expect(page.locator('iframe')).toBeAttached();
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('#runtime-overlay')).toBeHidden({ timeout: 30000 });
  return page.frames().find((f) => f !== page.mainFrame());
}
for (const [id, options] of Object.entries(titles))
  test(`${id}: real upstream game responds and preserves host boundaries`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    test.skip(
      !existsSync(
        new URL(`../../dist/${id}/build-record.json`, import.meta.url),
      ),
      'Explicit upstream build required',
    );
    const demo = await startCatalogDemo(options());
    try {
      await installSimulatedGamepad(page);
      const frame = await launch(page, demo, id),
        runtime = page.frameLocator('iframe');
      if (id === 'racer' || id === 'hexgl') {
        if (id === 'hexgl')
          await expect
            .poll(() => frame.evaluate(() => window.akeruRace.gameplay.step), {
              timeout: 10000,
            })
            .toBe(4);
        const speed = () =>
          frame.evaluate(
            (id) =>
              id === 'racer'
                ? window.speed
                : window.akeruRace.components.shipControls.speed,
            id,
          );
        await page.evaluate(() => window.__akeruTestGamepad.button(0, 1));
        await expect.poll(speed).toBeGreaterThan(1);
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(runtime.locator('body')).toHaveAttribute(
          'data-paused',
          'true',
        );
        const paused = await speed();
        await page.waitForTimeout(200);
        expect(await speed()).toBe(paused);
        await page
          .getByRole('button', { name: 'Resume', exact: true })
          .first()
          .click();
        await page.evaluate(() => window.__akeruTestGamepad.connect(false));
        await runtime
          .getByRole('button', { name: 'Restart', exact: true })
          .click();
        if (id === 'hexgl')
          await expect
            .poll(() => frame.evaluate(() => window.akeruRace.gameplay.step), {
              timeout: 10000,
            })
            .toBe(4);
        await runtime
          .getByRole('button', { name: 'Accelerate', exact: true })
          .hover();
        await page.mouse.down();
        await expect.poll(speed).toBeGreaterThan(1);
        await page.mouse.up();
      } else if (id === 'astray') {
        const before = await frame.evaluate(() => ({
          x: window.wBall.GetPosition().x,
          y: window.wBall.GetPosition().y,
          right: !window.maze[2][1],
        }));
        await page.evaluate(
          (right) =>
            window.__akeruTestGamepad.axis(right ? 0 : 1, right ? 1 : -1),
          before.right,
        );
        await expect
          .poll(() =>
            frame.evaluate(
              () => window.wBall.GetPosition().x + window.wBall.GetPosition().y,
            ),
          )
          .toBeGreaterThan(before.x + before.y + 0.1);
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(runtime.locator('body')).toHaveAttribute(
          'data-paused',
          'true',
        );
        const saved = await frame.evaluate(() => ({
          x: window.wBall.GetPosition().x,
          y: window.wBall.GetPosition().y,
          maze: JSON.stringify(window.maze),
        }));
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Exit', exact: true }).click();
        await page.getByRole('button', { name: /Play now/ }).click();
        await expect(page.locator('iframe')).toBeAttached();
        await expect(
          page.frameLocator('iframe').locator('body'),
        ).toHaveAttribute('data-ready', 'true');
        await expect(page.locator('#runtime-overlay')).toBeHidden();
        const next = page.frames().find((f) => f !== page.mainFrame());
        const restored = await next.evaluate(() => ({
          x: window.wBall.GetPosition().x,
          y: window.wBall.GetPosition().y,
          maze: JSON.stringify(window.maze),
        }));
        expect(restored.maze).toBe(saved.maze);
        expect(restored.x).toBeCloseTo(saved.x, 1);
        expect(restored.y).toBeCloseTo(saved.y, 1);
      } else {
        await runtime
          .getByRole('button', { name: 'Dot 1', exact: true })
          .click();
        await runtime
          .getByRole('button', { name: 'Dot 2', exact: true })
          .click();
        await expect(runtime.locator('#selection')).toContainText('1 → 2');
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Exit', exact: true }).click();
        await page.getByRole('button', { name: /Play now/ }).click();
        await expect(page.locator('iframe')).toBeAttached();
        await expect(
          page.frameLocator('iframe').locator('body'),
        ).toHaveAttribute('data-ready', 'true');
        await expect(page.locator('#runtime-overlay')).toBeHidden();
        await expect(runtime.locator('#selection')).toContainText('1 → 2');
        await page.evaluate(() => window.__akeruTestGamepad.button(1, 1));
        await expect(runtime.locator('#selection')).toContainText(
          'Choose four',
        );
        await page.evaluate(() => window.__akeruTestGamepad.neutral());
      }
      await expect(runtime.locator('#save-status')).toBeEmpty();
      mkdirSync(new URL('../../dist/previews/', import.meta.url), {
        recursive: true,
      });
      await runtime.locator('#stage').screenshot({
        path: new URL(`../../dist/previews/${id}.png`, import.meta.url)
          .pathname,
      });
    } finally {
      await demo.close();
    }
  });

test('Racer fills the viewport and restores touch controls after disconnect', async ({
  page,
}) => {
  const demo = await startCatalogDemo(racer());
  try {
    await installSimulatedGamepad(page);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto(demo.url + '/play/racer');
    const runtime = page.frameLocator('iframe');
    await expect(runtime.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(runtime.locator('.controls')).toBeHidden();
    const frame = page.frames().find((f) => f !== page.mainFrame());
    const aspectError = () =>
      frame.evaluate(() =>
        Math.abs(
          document.querySelector('canvas').width /
            document.querySelector('canvas').height -
            innerWidth / innerHeight,
        ),
      );
    await expect.poll(aspectError).toBeLessThan(0.01);
    await page.setViewportSize({ width: 430, height: 932 });
    await expect.poll(aspectError).toBeLessThan(0.01);
    await page.evaluate(() => window.__akeruTestGamepad.connect(false));
    await expect(runtime.locator('.controls')).toBeVisible();
    await page.evaluate(() => window.__akeruTestGamepad.connect(true));
    await expect(runtime.locator('.controls')).toBeHidden();
  } finally {
    await demo.close();
  }
});
