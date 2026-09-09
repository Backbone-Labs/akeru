import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const failures = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location();
        failures.push(
          `console.error${location.url ? ` (${location.url}:${location.lineNumber + 1})` : ''}: ${message.text()}`,
        );
      }
    });
    page.on('pageerror', (error) =>
      failures.push(`pageerror: ${error.stack ?? error.message}`),
    );
    await use(page);
    expect(failures, `Browser errors in ${testInfo.title}`).toEqual([]);
  },
});

export { expect };

export async function installSimulatedGamepad(page) {
  await page.addInitScript(() => {
    const state = {
      connected: true,
      buttons: Array(17).fill(0),
      axes: Array(4).fill(0),
    };
    const pad = {
      id: 'Akeru automated standard gamepad',
      index: 0,
      mapping: 'standard',
      connected: true,
      timestamp: 0,
      vibrationActuator: null,
      hapticActuators: [],
    };
    Object.defineProperties(pad, {
      buttons: {
        get: () =>
          state.buttons.map((value) => ({
            value,
            pressed: value > 0.5,
            touched: value > 0,
          })),
      },
      axes: { get: () => state.axes.slice() },
      connected: { get: () => state.connected },
      timestamp: { get: () => performance.now() },
    });
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => (state.connected ? [pad] : []),
    });
    Object.defineProperty(window, '__akeruTestGamepad', {
      configurable: false,
      value: {
        button(index, value) {
          state.buttons[index] = value;
        },
        axis(index, value) {
          state.axes[index] = value;
        },
        connect(value) {
          state.connected = value;
        },
        neutral() {
          state.buttons.fill(0);
          state.axes.fill(0);
        },
      },
    });
  });
}

export async function setGamepadButton(page, index, value) {
  await page.evaluate(
    ([buttonIndex, buttonValue]) =>
      window.__akeruTestGamepad.button(buttonIndex, buttonValue),
    [index, value],
  );
}

export async function neutralGamepad(page) {
  await page.evaluate(() => window.__akeruTestGamepad.neutral());
}

export async function launchDemo(page, url) {
  await page.goto(url);
  await page.getByRole('link', { name: /Orbit study/ }).click();
  await expect(page).toHaveURL(/\/g\/orbit-study$/);
  await page.getByRole('button', { name: /Play now/ }).click();
  const runtime = page.frameLocator(
    'iframe[title="Orbit study isolated runtime"]',
  );
  await expect(runtime.getByRole('status')).toHaveText('Ready when you are.');
  await expect(page.locator('#runtime-overlay')).toBeHidden();
  return runtime;
}

export async function orbPosition(runtime) {
  return runtime.locator('#orb').evaluate((element) => {
    const match = element.style.transform.match(
      /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/,
    );
    return match
      ? { x: Number(match[1]), y: Number(match[2]) }
      : { x: 0, y: 0 };
  });
}

export async function expectNoHorizontalOverflow(page) {
  const result = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.right > document.documentElement.clientWidth + 1 || box.left < -1
        );
      })
      .slice(0, 5)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).trim().replaceAll(/\s+/g, '.')}` : ''}`,
      ),
  }));
  expect(
    result.contentWidth,
    `Horizontal overflow from: ${result.offenders.join(', ')}`,
  ).toBeLessThanOrEqual(result.viewportWidth);
}
