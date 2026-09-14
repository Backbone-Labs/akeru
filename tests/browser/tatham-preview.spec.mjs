import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { existsSync, mkdirSync } from 'node:fs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { titles } from '../../packages/tatham/titles.mjs';
import { tathamOptions } from '../../packages/tatham/catalog.mjs';
const built = titles.every((t) =>
  existsSync(new URL(`../../dist/${t.id}/build-record.json`, import.meta.url)),
);
let demo;
test.use({ hasTouch: true });
test.beforeAll(async () => {
  if (built)
    demo = await startCatalogDemo({
      titles: titles.map((t) => tathamOptions(t.id)),
    });
});
test.afterAll(async () => {
  await demo?.close();
});
for (const title of titles)
  test(`${title.title}: original engine move, controller, touch, pause and host save`, async ({
    page,
  }) => {
    test.skip(!built, 'Run the explicit local Tatham build first.');
    await installSimulatedGamepad(page);
    await page.goto(`${demo.url}/g/${title.id}`);
    await page.getByRole('button', { name: /Play now/ }).click();
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    const runtime = page.frameLocator('iframe');
    await expect(runtime.locator('#save-status')).toContainText(
      'Guest progress saved',
    );
    const frame = page.frames().find((f) => f !== page.mainFrame());
    const result = await frame.evaluate((engineId) => {
      const engine = window.tathamEngine,
        canvas = document.querySelector('canvas');
      const count = () => Number(engine.save().match(/NSTATES :\d+:(\d+)/)[1]);
      const key = (name) =>
        canvas.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: name,
            keyCode:
              {
                Enter: 13,
                ' ': 32,
                ArrowLeft: 37,
                ArrowUp: 38,
                ArrowRight: 39,
                ArrowDown: 40,
              }[name] || name.charCodeAt(0),
            bubbles: true,
          }),
        );
      const before = count();
      const beforeInvalidLoad = engine.save();
      let invalidRejected = false;
      try {
        engine.load('not a native puzzle save');
      } catch {
        invalidRejected = true;
      }
      if (!invalidRejected || engine.save() !== beforeInvalidLoad)
        throw new Error('Invalid native save was not rejected transactionally');
      if (engineId === 'pegs')
        for (const name of [
          'ArrowRight',
          'ArrowRight',
          'ArrowRight',
          'ArrowUp',
          'Enter',
          'ArrowDown',
        ])
          key(name);
      else if (engineId === 'guess') {
        for (let k = 0; k < 4; k++) {
          key('Enter');
          key('ArrowRight');
        }
        key('Enter');
      } else if (engineId === 'untangle') {
        key('Enter');
        key('Enter');
        key('ArrowRight');
        key('Enter');
      }
      let seed = 987,
        iterations = 0;
      while (count() === before && iterations++ < 300) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        key(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][seed >>> 30]);
        if (['solo', 'unequal', 'towers'].includes(engineId)) key('1');
        else if (!['fifteen', 'inertia'].includes(engineId)) {
          key('Enter');
          if (engineId === 'samegame') key('Enter');
        }
      }
      window.__tathamInputs = { keys: 0, pointers: 0 };
      const oldKey = engine.key,
        oldPointer = engine.pointer;
      engine.key = (...args) => {
        window.__tathamInputs.keys++;
        return oldKey(...args);
      };
      engine.pointer = (...args) => {
        window.__tathamInputs.pointers++;
        return oldPointer(...args);
      };
      return { before, after: count(), save: engine.save() };
    }, title.engine);
    expect(result.after).toBeGreaterThan(result.before);
    // Real standard-gamepad events traverse the host's authenticated channel.
    await setGamepadButton(page, 0, 1);
    await expect
      .poll(() =>
        frame.evaluate(
          () => window.__tathamInputs.keys + window.__tathamInputs.pointers,
        ),
      )
      .toBeGreaterThan(0);
    await setGamepadButton(page, 0, 0);
    const pointerBefore = await frame.evaluate(
      () => window.__tathamInputs.pointers,
    );
    await runtime.locator('canvas').tap({ position: { x: 30, y: 30 } });
    await expect
      .poll(() => frame.evaluate(() => window.__tathamInputs.pointers))
      .toBeGreaterThan(pointerBefore);
    // Save through the real host, then verify direct keyboard is blocked by pause.
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(runtime.locator('body')).toHaveClass(/paused/);
    const pausedSave = await frame.evaluate(() => window.tathamEngine.save());
    await frame.evaluate(() =>
      document.querySelector('canvas').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          keyCode: 39,
          bubbles: true,
        }),
      ),
    );
    expect(await frame.evaluate(() => window.tathamEngine.save())).toBe(
      pausedSave,
    );
    // Wrong-nonce messages from the correct parent still cannot resume a title.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      iframe.contentWindow.postMessage(
        {
          protocol: 'akeru.catalog.v1',
          nonce: 'wrong',
          sequence: 999999,
          type: 'resume',
        },
        new URL(iframe.src).origin,
      );
    });
    await expect(runtime.locator('body')).toHaveClass(/paused/);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(runtime.locator('body')).not.toHaveClass(/paused/);
    mkdirSync(new URL('../../dist/previews/', import.meta.url), {
      recursive: true,
    });
    await runtime.locator('canvas').screenshot({
      path: new URL(`../../dist/previews/${title.id}.png`, import.meta.url)
        .pathname,
    });
    const saved = await frame.evaluate(() => window.tathamEngine.save());
    await page.waitForTimeout(1200);
    await page.reload();
    await page.getByRole('button', { name: /Play now/ }).click();
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    await expect(
      page.frameLocator('iframe').locator('#save-status'),
    ).toContainText('Guest progress saved');
    const restoredFrame = page.frames().find((f) => f !== page.mainFrame());
    const restored = await restoredFrame.evaluate(() =>
      window.tathamEngine.save(),
    );
    // Mines resumes its timer immediately; compare the puzzle and move history.
    const withoutTime = (value) => value.replace(/^TIME    :.*\n/m, '');
    expect(withoutTime(restored)).toBe(withoutTime(saved));
  });
