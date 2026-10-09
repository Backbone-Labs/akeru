import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';

test('glass pad supports concurrent sticks, fire, cancellation and hide release', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(demo.url);
    await page.evaluate(async () => {
      const { createBrowserInputProvider } = await import('/input/browser.js');
      document.body.className = 'direct-player';
      // Synthetic multi-pointer events exercise routing; real capture is tested below.
      window.originalCapture = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function () {};
      document.body.innerHTML =
        '<div class="runtime-wrap"><div id="touch-controls"></div></div>';
      const input = createBrowserInputProvider({ titleId: 'touch-test' });
      window.input = input;
      window.seen = [];
      input.mount({ touchRoot: document.querySelector('#touch-controls') });
      input.subscribe((s) => window.seen.push(s));
      input.start();
    });
    const stick = page.locator('.touch-stick-left');
    const rect = await stick.boundingBox();
    await stick.dispatchEvent('pointerdown', {
      pointerId: 1,
      clientX: rect.x + rect.width / 2 + 44,
      clientY: rect.y + rect.height / 2,
    });
    const fire = await page.locator('[data-control=south]').boundingBox();
    await page.locator('[data-control=south]').dispatchEvent('pointerdown', {
      pointerId: 2,
      clientX: fire.x + fire.width / 2,
      clientY: fire.y + fire.height / 2,
    });
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).buttons.confirm))
      .toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).axes.moveX))
      .toBe(1);
    await stick.dispatchEvent('pointermove', {
      pointerId: 1,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y,
    });
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).buttons.confirm))
      .toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).axes.moveY))
      .toBe(-1);
    await stick.dispatchEvent('pointercancel', { pointerId: 1 });
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).axes.moveY ?? 0))
      .toBe(0);
    await page.evaluate(() => {
      document.querySelector('#touch-controls').hidden = true;
    });
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).buttons.confirm))
      .toBe(0);
    await page.evaluate(() => {
      document.querySelector('#touch-controls').hidden = false;
    });
    await page.screenshot({ path: '/tmp/akeru-touch-pad.png' });
    await page.evaluate(() => {
      Element.prototype.setPointerCapture = window.originalCapture;
    });
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width + 80, rect.y + rect.height / 2);
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).axes.moveX))
      .toBe(1);
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.seen.at(-1).axes.moveX ?? 0))
      .toBe(0);
    for (const size of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const bounds = await page
        .locator('#touch-controls .touch-glass:not(.touch-knob)')
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
        );
      expect(bounds.every((r) => r.left >= 0 && r.right <= size.width)).toBe(
        true,
      );
    }
  } finally {
    await demo.close();
  }
});
