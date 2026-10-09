import { existsSync, mkdirSync } from 'node:fs';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options } from '../../packages/slipface/catalog.mjs';

const built = existsSync(
  new URL('../../dist/slipface/build-record.json', import.meta.url),
);
// Standard mapping: 0 A, 1 B, 7 RT, 8 View, 9 Menu.
const A = 0,
  B = 1,
  RT = 7,
  VIEW = 8,
  MENU = 9;
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(120);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(250);
};
const stick = (page, x) =>
  page.evaluate((value) => window.__akeruTestGamepad.axis(0, value), x);
const frame = (page) => page.frames().find((f) => f !== page.mainFrame());
const status = (page) =>
  frame(page).evaluate(() => {
    const s = window.slipface.status();
    return {
      mode: s.mode,
      paused: s.paused,
      hostPaused: s.hostPaused,
      countingIn: s.countingIn,
      input: s.input,
      gamepad: s.gamepad,
      touchControls: s.touchControls,
      targets: s.targets,
      hudCard: s.hudCard,
      audio: s.audio && { muted: s.audio.muted, status: s.audio.status },
      save: s.save,
      run: s.run && {
        tick: s.run.tick,
        x: s.run.x,
        tucking: s.run.tucking,
        braking: s.run.braking,
        airborne: s.run.airborne,
      },
    };
  });
/** Count what the title frame asks of the device behind the host's back. */
async function watchDeviceAccess(page) {
  await page.addInitScript(() => {
    if (window.top === window) return;
    const seen = { gamepads: 0, databases: 0, storage: 0, requests: 0 };
    const read = navigator.getGamepads;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value() {
        seen.gamepads++;
        return read.call(navigator);
      },
    });
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      seen.databases++;
      return open.apply(this, args);
    };
    for (const method of ['getItem', 'setItem', 'removeItem', 'key']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        seen.storage++;
        return original.apply(this, args);
      };
    }
    const request = window.fetch;
    window.fetch = function (...args) {
      seen.requests++;
      return request.apply(this, args);
    };
    window.__slipfaceDeviceAccess = seen;
  });
}
async function launch(page, demo) {
  await page.goto(demo.url + '/play/slipface');
  await expect
    .poll(
      async () => {
        const f = frame(page);
        if (!f || !(await page.locator('#runtime-overlay').isHidden()))
          return null;
        return f
          .evaluate(() => {
            const s = window.slipface?.status();
            return s && !s.hostPaused ? s.mode : null;
          })
          .catch(() => null);
      },
      { timeout: 25000 },
    )
    .toBe('title');
  return frame(page);
}

test('Slipface controller play, both pause menus, disconnect and host-only device access', async ({
  page,
}) => {
  test.skip(!built, 'Slipface source build required');
  test.setTimeout(120000);
  const demo = await startCatalogDemo({ titles: [options()] });
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installSimulatedGamepad(page);
    await watchDeviceAccess(page);
    // The shell's controller reports what it is asked to rumble.
    await page.addInitScript(() => {
      if (window.top !== window) return;
      window.__rumbles = [];
      const original = navigator.getGamepads;
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () =>
          original().map((pad) => {
            pad.vibrationActuator = {
              playEffect: async (_type, effect) => {
                window.__rumbles.push(effect);
                return 'complete';
              },
              reset: async () => {},
            };
            return pad;
          }),
      });
    });
    const violations = [];
    const requests = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text()))
        violations.push(message.text());
    });
    page.on('request', (request) => requests.push(request.url()));
    const f = await launch(page, demo);
    const origin = new URL(f.url()).origin;
    expect(origin).not.toBe(demo.url);
    expect((await status(page)).gamepad).toBe('host');
    await expect(f.locator('#akeru-status')).toBeEmpty();
    // The game draws its own touch controls; the host overlay stays out of the way.
    await expect(page.locator('#touch-controls')).toBeHidden();
    // The catalog cover: the game's own title screen, without the shell's button over it.
    mkdirSync(new URL('../../dist/previews/', import.meta.url), {
      recursive: true,
    });
    const menuButton = page.locator('#player-menu');
    await menuButton.evaluate((button) => {
      button.style.visibility = 'hidden';
    });
    await f.locator('canvas').screenshot({
      path: new URL('../../dist/previews/slipface.png', import.meta.url)
        .pathname,
    });
    await menuButton.evaluate((button) => {
      button.style.visibility = '';
    });

    // A starts Today's Dune; the stick pushes off and steers.
    await press(page, A);
    await expect.poll(async () => (await status(page)).mode).toBe('ready');
    await stick(page, 0.8);
    await expect.poll(async () => (await status(page)).mode).toBe('run');
    await expect
      .poll(async () => (await status(page)).run.x)
      .toBeGreaterThan(4);
    expect((await status(page)).input).toBe('host');
    await stick(page, 0);
    await setGamepadButton(page, RT, 0.6);
    await expect.poll(async () => (await status(page)).run.tucking).toBe(true);
    await setGamepadButton(page, RT, 0);
    await expect.poll(async () => (await status(page)).run.tucking).toBe(false);
    await setGamepadButton(page, B, 1);
    await expect.poll(async () => (await status(page)).run.braking).toBe(true);
    await setGamepadButton(page, B, 0);
    await setGamepadButton(page, A, 1);
    await expect.poll(async () => (await status(page)).run.airborne).toBe(true);
    await setGamepadButton(page, A, 0);

    // View is the game's own pause menu. B closes it and the run is counted back in.
    await press(page, VIEW);
    let s = await status(page);
    expect(s.paused).toBe(true);
    expect(s.hostPaused).toBe(false);
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    const held = s.run.tick;
    await page.waitForTimeout(250);
    expect((await status(page)).run.tick).toBe(held);
    await press(page, B);
    s = await status(page);
    expect(s.paused).toBe(false);
    expect(s.countingIn).toBe(true);
    expect(s.run.tick).toBe(held);
    await expect
      .poll(async () => (await status(page)).run.tick)
      .toBeGreaterThan(held);

    // Menu is Akeru's. The simulation and sound stop; Resume counts the rider
    // back in rather than leaving a second menu to close.
    await press(page, MENU);
    await expect(page.locator('#runtime-overlay')).toBeVisible();
    s = await status(page);
    expect(s.hostPaused).toBe(true);
    expect(s.audio.status).not.toBe('running');
    const stopped = s.run.tick;
    await stick(page, 1);
    await page.waitForTimeout(300);
    expect((await status(page)).run.tick).toBe(stopped);
    await stick(page, 0);
    // Vibration is the player's choice, made in the shell. Nothing was sent before it.
    expect(await page.evaluate(() => window.__rumbles.length)).toBe(0);
    await page
      .getByRole('button', { name: 'Sound and vibration', exact: true })
      .click();
    await page.getByRole('button', { name: 'Vibration', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => (await status(page)).hostPaused).toBe(false);
    s = await status(page);
    expect(s.paused).toBe(false);
    expect(s.countingIn).toBe(true);
    expect(s.run.tick).toBe(stopped);
    await expect
      .poll(async () => (await status(page)).run.tick)
      .toBeGreaterThan(stopped);

    // A hop lands with a tap on the controller's motors, through the shell.
    await setGamepadButton(page, A, 1);
    await expect.poll(async () => (await status(page)).run.airborne).toBe(true);
    await setGamepadButton(page, A, 0);
    await expect
      .poll(() => page.evaluate(() => window.__rumbles.length))
      .toBeGreaterThan(0);
    const rumble = await page.evaluate(() => window.__rumbles[0]);
    expect(rumble.duration).toBeGreaterThanOrEqual(1);
    expect(rumble.duration).toBeLessThanOrEqual(500);
    expect(rumble.weakMagnitude).toBeGreaterThan(0);

    // Only the shell's own messages count: right window, right nonce, never replayed.
    const nonce = new URLSearchParams(new URL(f.url()).hash.slice(1)).get(
      'nonce',
    );
    const forged = (sequence, withNonce) => ({
      protocol: 'akeru.catalog.v1',
      nonce: withNonce,
      sequence,
      type: 'pause',
      payload: {},
    });
    // From the title's own window, even with the real nonce.
    await f.evaluate(
      (message) => window.postMessage(message, '*'),
      forged(999999, nonce),
    );
    // From the shell's window with the wrong nonce, and replaying an old sequence.
    await page.evaluate(
      (messages) => {
        const target = document.querySelector('iframe').contentWindow;
        for (const message of messages) target.postMessage(message, '*');
      },
      [forged(999999, 'wrong'), forged(0, nonce)],
    );
    await page.waitForTimeout(200);
    s = await status(page);
    expect(s.hostPaused).toBe(false);
    expect(s.paused).toBe(false);

    // Losing the controller mid-run opens the game's pause menu and drops what was held.
    await stick(page, 1);
    await setGamepadButton(page, RT, 1);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__akeruTestGamepad.connect(false));
    await expect.poll(async () => (await status(page)).paused).toBe(true);
    s = await status(page);
    expect(s.hostPaused).toBe(false);
    const dropped = s.run.tick;
    await page.waitForTimeout(300);
    expect((await status(page)).run.tick).toBe(dropped);
    await page.evaluate(() => {
      window.__akeruTestGamepad.neutral();
      window.__akeruTestGamepad.connect(true);
    });

    // The keyboard is still the game's own.
    await f.locator('canvas').click({ position: { x: 20, y: 300 } });
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await status(page)).paused).toBe(false);
    await expect.poll(async () => (await status(page)).input).toBe('keyboard');

    // Nothing was read or stored except through the host, and nothing was fetched.
    expect(await f.evaluate(() => window.__slipfaceDeviceAccess)).toEqual({
      gamepads: 0,
      databases: 0,
      storage: 0,
      requests: 0,
    });
    expect(violations).toEqual([]);
    const fromTitle = requests.filter((url) => url.startsWith(origin));
    expect(fromTitle.length).toBeGreaterThan(10);
    expect(
      fromTitle.every((url) => /\/[a-zA-Z0-9._-]+\.(?:html|js|css)$/.test(url)),
    ).toBe(true);
  } finally {
    await demo.close();
  }
});

test('Slipface pill actions and guest progress in the host save slot', async ({
  page,
}) => {
  test.skip(!built, 'Slipface source build required');
  test.setTimeout(120000);
  const demo = await startCatalogDemo({ titles: [options()] });
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    // The app's native menu drives the same title actions as the web pill.
    await page.addInitScript(() => {
      if (window.top !== window) return;
      window.webkit = {
        messageHandlers: {
          akeruPlayer: {
            postMessage: async (message) => message.action === 'menu',
          },
        },
      };
    });
    await launch(page, demo);
    const command = (action, payload = {}) =>
      page.evaluate(
        ([a, p]) => window.akeruNative.command(a, p, 2),
        [action, payload],
      );
    // The menu attaches just after the title becomes playable.
    const attached = () =>
      expect
        .poll(() =>
          command('save-status').then(
            (result) => result.ok,
            () => false,
          ),
        )
        .toBe(true);
    await attached();
    const saved = await command('save');
    expect(saved.ok).toBe(true);
    expect(saved.state.hasManualSave).toBe(false);
    expect((await command('restore')).ok).toBe(false);
    expect((await command('restart')).ok).toBe(false);

    // Native input reaches the game through the same authenticated channel.
    await command('input', { buttons: 1 });
    await expect.poll(async () => (await status(page)).mode).toBe('ready');
    await command('input', { buttons: 0, leftX: 30000 });
    await expect.poll(async () => (await status(page)).mode).toBe('run');
    await expect
      .poll(async () => (await status(page)).run.tick)
      .toBeGreaterThan(30);
    await command('input', {});
    await command('pause');
    expect((await status(page)).hostPaused).toBe(true);
    const restarted = await command('restart');
    expect(restarted.ok).toBe(true);
    let s = await status(page);
    expect(s.mode).toBe('ready');
    expect(s.run.tick).toBe(0);

    // Sound: off and on again from the pill, and the choice is progress.
    expect((await command('audio-status')).state.audioState).toBe('on');
    expect((await command('audio')).state.audioState).toBe('off');
    expect((await status(page)).audio.muted).toBe(true);
    await command('resume');
    await expect.poll(async () => (await status(page)).hostPaused).toBe(false);

    // Progress written through the game's own save path comes back from the host slot.
    const restored = await frame(page).evaluate(async () => {
      const data = window.slipface.serialize();
      data.freeBest = 1234;
      data.best = { m: 2345, day: '2026-10-08' };
      return window.slipface.restore(data);
    });
    expect(restored).toEqual({ ok: true, status: 'ok' });
    await page.reload();
    await launch(page, demo);
    s = await status(page);
    expect(s.save.loaded).toBe('ok');
    expect(s.audio.muted).toBe(true);
    const again = await frame(page).evaluate(() => window.slipface.serialize());
    expect(again.freeBest).toBe(1234);
    expect(again.best).toEqual({ m: 2345, day: '2026-10-08' });
    expect(again.muted).toBe(true);
    await expect(frame(page).locator('#akeru-status')).toBeEmpty();
    await attached();
    expect((await command('audio')).state.audioState).toBe('on');
    expect((await status(page)).audio.muted).toBe(false);
  } finally {
    await demo.close();
  }
});

test('Slipface does not overwrite progress another session saved first', async ({
  page,
  context,
}) => {
  test.skip(!built, 'Slipface source build required');
  test.setTimeout(120000);
  const demo = await startCatalogDemo({ titles: [options()] });
  const other = await context.newPage();
  try {
    await launch(page, demo);
    await other.addInitScript(() => {
      try {
        localStorage.setItem('akeru.onboarding.v1', 'complete');
      } catch {
        /* No storage on some fixture origins. */
      }
    });
    await launch(other, demo);
    const write = (target, metres) =>
      frame(target).evaluate(async (m) => {
        const data = window.slipface.serialize();
        data.freeBest = m;
        return window.slipface.restore(data);
      }, metres);
    // Each session stores its settings as it starts, so the later one holds
    // the slot's current revision and the earlier one's is stale.
    expect((await write(other, 1111)).ok).toBe(true);
    expect((await write(page, 2222)).ok).toBe(false);
    await expect(frame(page).locator('#akeru-status')).toHaveText(
      'Saving unavailable. Existing progress is preserved.',
    );
    expect((await write(page, 3333)).ok).toBe(false);
    await page.reload();
    await launch(page, demo);
    expect(
      await frame(page).evaluate(() => window.slipface.serialize().freeBest),
    ).toBe(1111);
    await expect(frame(page).locator('#akeru-status')).toBeEmpty();
  } finally {
    await other.close();
    await demo.close();
  }
});

test.describe('Slipface touch', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test('its own controls ride, and its HUD stays clear of the Akeru menu button', async ({
    page,
  }) => {
    test.skip(!built, 'Slipface source build required');
    test.setTimeout(90000);
    const demo = await startCatalogDemo({ titles: [options()] });
    try {
      await launch(page, demo);
      let s = await status(page);
      expect(s.touchControls).toBe(true);
      await expect(page.locator('#touch-controls')).toBeHidden();
      const item = s.targets.find((t) => t.id === 'menu' && t.index === 0);
      await page.touchscreen.tap(item.x, item.y);
      await expect.poll(async () => (await status(page)).mode).toBe('ready');
      s = await status(page);
      const pill = await page.locator('#player-menu').boundingBox();
      const pause = s.targets.find((t) => t.id === 'pause');
      const clear = (box) =>
        box.x + box.w <= pill.x ||
        box.x >= pill.x + pill.width ||
        box.y + box.h <= pill.y ||
        box.y >= pill.y + pill.height;
      expect(clear(s.hudCard)).toBe(true);
      expect(
        clear({
          x: pause.x - pause.w / 2,
          y: pause.y - pause.h / 2,
          w: pause.w,
          h: pause.h,
        }),
      ).toBe(true);
      expect(pause.w).toBeGreaterThanOrEqual(44);

      // Slide the left thumb to push off and carve.
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, points) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await touch('touchStart', [{ x: 60, y: 330, id: 1 }]);
      await touch('touchMove', [{ x: 95, y: 330, id: 1 }]);
      await expect.poll(async () => (await status(page)).mode).toBe('run');
      await expect
        .poll(async () => (await status(page)).run.x)
        .toBeGreaterThan(4);
      expect((await status(page)).input).toBe('touch');
      await touch('touchEnd', []);
    } finally {
      await demo.close();
    }
  });

  test('a connected controller keeps the on-screen controls away until the screen is touched', async ({
    page,
  }) => {
    test.skip(!built, 'Slipface source build required');
    test.setTimeout(90000);
    await installSimulatedGamepad(page);
    const demo = await startCatalogDemo({ titles: [options()] });
    try {
      await launch(page, demo);
      // A phone clipped into a controller has a touchscreen too.
      await expect
        .poll(async () => (await status(page)).touchControls)
        .toBe(false);
      await press(page, A);
      await expect.poll(async () => (await status(page)).mode).toBe('ready');
      expect((await status(page)).touchControls).toBe(false);
      await page.touchscreen.tap(300, 200);
      await expect
        .poll(async () => (await status(page)).touchControls)
        .toBe(true);
      await expect(page.locator('#touch-controls')).toBeHidden();
      await stick(page, 0.8);
      await expect
        .poll(async () => (await status(page)).touchControls)
        .toBe(false);
      await stick(page, 0);
    } finally {
      await demo.close();
    }
  });
});
