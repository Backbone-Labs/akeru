import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  test,
  expect,
  installSimulatedGamepad,
  setGamepadButton,
} from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import {
  deadEndDashTitles,
  withLocalRelay,
} from '../../packages/dead-end-dash/catalog.mjs';

// The source lives in its own repository; public CI has no build of it.
const built = existsSync(
  new URL('../../dist/dead-end-dash/build-record.json', import.meta.url),
);
// The party relay is a second, separate build of the same pinned source.
const relayEntry = fileURLToPath(
  new URL('../../dist/dead-end-dash-server/index.mjs', import.meta.url),
);
/** A free loopback port. The relay has to know its own address before it
 * starts: the local bridge presents that address as the title's origin. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
/** The built relay runtime on a loopback port, admitting only the bridge. */
const startRelay = async (port) => {
  const child = spawn(process.execPath, [relayEntry], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      HOST: '127.0.0.1',
      TITLE_ORIGINS: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const gone = once(child, 'close');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Relay did not start')),
      8000,
    );
    child.stdout.on('data', (data) => {
      if (String(data).includes('localhost:' + port)) {
        clearTimeout(timer);
        resolve();
      }
    });
    gone.then(() => reject(new Error('Relay exited')));
  });
  return async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM');
    await gone;
  };
};
const press = async (page, index) => {
  await setGamepadButton(page, index, 1);
  await page.waitForTimeout(100);
  await setGamepadButton(page, index, 0);
  await page.waitForTimeout(160);
};
/** The running title's frame. Waits for things that have happened, never for
 * the absence of something that may not exist yet: the frame is attached, the
 * game inside it is ready, and only then has the launch screen gone. */
const runtime = async (page) => {
  await page.locator('iframe').waitFor({ state: 'attached', timeout: 20000 });
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.waitForFunction(() => window.__ded?.game?.ready === true, null, {
    timeout: 20000,
  });
  await expect(page.locator('#runtime-overlay')).toBeHidden({ timeout: 20000 });
  // A button that arrives already down just after play resumes is treated as
  // held through the launch screen. Let that moment pass before pressing.
  await page.waitForTimeout(250);
  return frame;
};
const open = async (page, demo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(demo.url + '/play/dead-end-dash');
  return runtime(page);
};
const state = (frame) =>
  frame.evaluate(() => {
    const g = window.__ded.game;
    return {
      screen: g.ui.screen?.name ?? null,
      mode: g.simMode,
      inPlay: g.inPlay,
      suspended: g.suspended,
      x: g.me.x,
      y: g.me.y,
      air: g.me.air,
      clock: g.run ? g.run.t : null,
      mx: g.input.mx,
      my: g.input.my,
      device: g.input.device,
      controller: g.pad.connected,
    };
  });
/** A wandering Gnasher or a blind jump must not end the dash under test. */
const startDash = async (frame) => {
  await expect
    .poll(async () => (await state(frame)).clock, { timeout: 15000 })
    .toBeGreaterThanOrEqual(0);
  await frame.evaluate(() => {
    window.__ded.game.me.inv = 600;
  });
};
/** The start tile has at least one open side: try each until the dasher moves. */
const moved = async (frame, push, release) => {
  let best = 0;
  for (const [x, y] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const before = await state(frame);
    await push(x, y);
    await frame.page().waitForTimeout(400);
    const after = await state(frame);
    await release();
    best = Math.max(best, Math.hypot(after.x - before.x, after.y - before.y));
    if (best > 8) break;
  }
  return best;
};
const hostSave = (page) =>
  page.evaluate(async () => {
    const { createSaveStore } = await import('/saves/index.js');
    const record = await createSaveStore()
      .forTitle({ titleId: 'dead-end-dash', schemaVersion: 1 })
      .service.read('progress');
    return record
      ? { revision: record.revision, bytes: Array.from(record.bytes) }
      : null;
  });

test.describe('Dead End Dash', () => {
  test.skip(!built, 'Explicit Dead End Dash source build required');
  let demo;
  test.beforeAll(async () => {
    demo = await startCatalogDemo({ titles: deadEndDashTitles() });
  });
  test.afterAll(async () => {
    await demo?.close();
  });

  test('controller menus, a solo dash, both menus, disconnect and host saves', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await installSimulatedGamepad(page);
    const frame = await open(page, demo);
    // The stylesheet and typeface are this title's own files: nothing inline.
    expect(await frame.locator('style').count()).toBe(0);
    expect(
      await frame.evaluate(() =>
        [...document.fonts]
          .filter((f) => f.family === 'Pixelify Sans' && f.status === 'loaded')
          .map((f) => f.weight)
          .sort(),
      ),
    ).toEqual(['400', '700']);
    expect(await frame.evaluate(() => window.__ded.game.storePersistent)).toBe(
      true,
    );
    expect((await state(frame)).screen).toBe('title');
    const touch = page.locator('#touch-controls');
    await expect(touch).toHaveAttribute('data-title-touch', 'hidden');

    await press(page, 0); // A on Solo Dash
    await expect
      .poll(async () => (await state(frame)).screen)
      .toBe('difficulty');
    await press(page, 0); // A on Doomed
    await expect.poll(async () => (await state(frame)).mode).toBe('huddle');
    expect((await state(frame)).device).toBe('gamepad');
    await press(page, 0); // A on Dash!
    await startDash(frame);
    expect((await state(frame)).inPlay).toBe(true);
    await expect(touch).toHaveAttribute('data-title-touch', 'auto');

    expect(
      await moved(
        frame,
        (x, y) =>
          page.evaluate(
            ([ax, ay]) => {
              window.__akeruTestGamepad.axis(0, ax);
              window.__akeruTestGamepad.axis(1, ay);
            },
            [x, y],
          ),
        () => page.evaluate(() => window.__akeruTestGamepad.neutral()),
      ),
    ).toBeGreaterThan(8);

    // Menu belongs to Akeru: the dash and its clock stop behind the host menu.
    await press(page, 9);
    await expect(page.locator('#runtime-overlay')).toBeVisible();
    await expect.poll(async () => (await state(frame)).suspended).toBe(true);
    const frozen = await state(frame);
    await page.waitForTimeout(300);
    expect((await state(frame)).clock).toBe(frozen.clock);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    // A timed dash does not restart under the player: the game waits behind
    // its own pause screen until they say so.
    await expect.poll(async () => (await state(frame)).screen).toBe('pause');
    await expect(touch).toHaveAttribute('data-title-touch', 'hidden');
    expect((await state(frame)).clock).toBe(frozen.clock);
    await page.waitForTimeout(250);
    await press(page, 0); // A on Back to it
    await expect.poll(async () => (await state(frame)).inPlay).toBe(true);

    // View opens the game's own menu without involving the host.
    await press(page, 8);
    await expect.poll(async () => (await state(frame)).screen).toBe('pause');
    await expect(page.locator('#runtime-overlay')).toBeHidden();
    await press(page, 1); // B goes back
    await expect.poll(async () => (await state(frame)).inPlay).toBe(true);

    await setGamepadButton(page, 0, 1); // A jumps
    await expect.poll(async () => (await state(frame)).air).toBeGreaterThan(0);
    await setGamepadButton(page, 0, 0);

    // A held stick must not survive the controller going away.
    await page.evaluate(() => window.__akeruTestGamepad.axis(0, 1));
    await expect.poll(async () => (await state(frame)).mx).toBeGreaterThan(0.5);
    await page.evaluate(() => window.__akeruTestGamepad.connect(false));
    await expect.poll(async () => (await state(frame)).mx).toBe(0);
    await expect.poll(async () => (await state(frame)).controller).toBe(0);
    // Isolated title code cannot turn a forged message into host input.
    await frame.evaluate(() =>
      window.postMessage(
        {
          protocol: 'akeru.catalog.v1',
          nonce: 'wrong',
          sequence: 99999,
          type: 'input',
          payload: {
            provider: 'gamepad',
            connected: true,
            buttons: {},
            axes: { moveX: 1 },
          },
        },
        '*',
      ),
    );
    await page.waitForTimeout(150);
    expect((await state(frame)).mx).toBe(0);

    // Records were written through the host when the descent began, and the
    // descent itself at its huddle: both come back after a reload.
    await frame.evaluate(() => window.__ded.game.leave());
    await expect.poll(async () => (await state(frame)).screen).toBe('title');
    await expect.poll(() => hostSave(page)).not.toBeNull();
    await page.reload();
    const again = await runtime(page);
    const saved = await again.evaluate(() => ({
      solo: window.__ded.game.save.solo?.dp ?? null,
      descents: window.__ded.game.records.descents,
    }));
    expect(saved.solo).toBe(1);
    expect(saved.descents).toBe(1);
    await expect(again.locator('[data-fid=cont]')).toBeVisible();
  });

  test('the Backbone pill and bridge: saves, sound, restart, pause and input', async ({
    page,
  }) => {
    test.setTimeout(120000);
    // The app's side of the bridge, as the shell expects to find it.
    await page.addInitScript(() => {
      window.webkit = {
        messageHandlers: {
          akeruPlayer: {
            postMessage: async (message) => message.action === 'menu',
          },
        },
      };
    });
    let frame = await open(page, demo);
    const command = (action, payload = {}) =>
      page.evaluate(
        ([a, p]) => window.akeruNative.command(a, p, 2),
        [action, payload],
      );
    const tap = async (buttons) => {
      await command('input', { buttons });
      await page.waitForTimeout(120);
      await command('input', {});
      await page.waitForTimeout(160);
    };
    await expect.poll(async () => (await command('save-status')).ok).toBe(true);
    const saved = await command('save');
    expect(saved.ok).toBe(true);
    expect(saved.state.hasManualSave).toBe(false);
    // No snapshot of a dash exists, so none is claimed or restored.
    expect((await command('restore')).ok).toBe(false);
    expect((await command('restart')).ok).toBe(false);

    // A tap on the game's own menu, then the controller: the highlight must
    // come back, because the bridge reports every controller as `touch`.
    await frame.locator('[data-fid=how]').click();
    await expect.poll(async () => (await state(frame)).screen).toBe('howto');
    await tap(2); // B goes back
    await expect.poll(async () => (await state(frame)).screen).toBe('title');
    await tap(32); // D-pad down
    await expect(frame.locator('.ded-btn.is-focus')).toHaveCount(1);

    await frame.locator('[data-fid=solo]').click();
    await frame.locator('[data-fid=dnormal]').click();
    await expect.poll(async () => (await state(frame)).mode).toBe('huddle');
    await frame.locator('[data-fid=dash]').click();
    await startDash(frame);
    await command('input', { leftX: 32767 });
    await expect.poll(async () => (await state(frame)).mx).toBeGreaterThan(0.9);

    // The pill opens: the dash stops, the held stick is dropped and input
    // sent meanwhile goes nowhere.
    await command('pause');
    await expect.poll(async () => (await state(frame)).suspended).toBe(true);
    expect((await state(frame)).mx).toBe(0);
    await command('input', { buttons: 1, leftX: 32767 });
    await page.waitForTimeout(150);
    expect((await state(frame)).mx).toBe(0);
    const audio = await command('audio-status');
    expect(['on', 'blocked']).toContain(audio.state.audioState);
    expect((await command('audio')).state.audioState).toBe('off');
    expect(await frame.evaluate(() => window.__ded.game.settings.muted)).toBe(
      true,
    );
    // The player closes the pill with A and is still holding it as the game
    // resumes. That A must not answer the game's own pause screen for them.
    await command('resume');
    await command('input', { buttons: 1 });
    await expect.poll(async () => (await state(frame)).screen).toBe('pause');
    await page.waitForTimeout(500);
    expect((await state(frame)).screen).toBe('pause');
    await command('input', {});
    await tap(1); // released, then a real A on Back to it
    await expect.poll(async () => (await state(frame)).inPlay).toBe(true);

    const restarted = await command('restart');
    expect(restarted.ok).toBe(true);
    await expect.poll(async () => (await state(frame)).screen).toBe('title');
    expect((await command('save')).ok).toBe(true);
    await page.reload();
    frame = await runtime(page);
    // The descent as of its huddle and the pill's sound choice both persist.
    expect(
      await frame.evaluate(() => ({
        solo: window.__ded.game.save.solo?.dp ?? null,
        muted: window.__ded.game.settings.muted,
      })),
    ).toEqual({ solo: 1, muted: true });
  });

  test('parties are off, and say so, until a relay is switched on', async ({
    page,
  }) => {
    const frame = await open(page, demo);
    await frame.locator('[data-fid=host]').click();
    const notice = frame.getByRole('dialog');
    await expect(notice).toContainText(
      'Parties are not switched on here yet. Solo play works everywhere.',
    );
    await notice.getByRole('button', { name: 'OK' }).click();
    await frame.locator('[data-fid=join]').click();
    await expect(frame.getByRole('dialog')).toContainText(
      'Parties are not switched on here yet',
    );
    // No socket was attempted: the page fixture fails on any console error.
    expect(await frame.evaluate(() => window.__ded.game.session === null)).toBe(
      true,
    );
  });

  test('a save this build cannot read is left untouched', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(demo.url + '/games');
    const bytes = [123, 34, 111, 108, 100, 34, 58, 49, 125]; // {"old":1}
    await page.evaluate(async (data) => {
      const { createSaveStore } = await import('/saves/index.js');
      await createSaveStore()
        .forTitle({ titleId: 'dead-end-dash', schemaVersion: 1 })
        .service.write(
          'progress',
          { schemaVersion: 1, bytes: new Uint8Array(data) },
          null,
        );
    }, bytes);
    const before = await hostSave(page);
    const frame = await open(page, demo);
    await expect(frame.locator('.ded-toast')).toContainText(
      'could not be read and has been left untouched',
    );
    expect(await frame.evaluate(() => window.__ded.game.storePersistent)).toBe(
      false,
    );
    // Playing on must not replace what is there with a fresh, emptier save.
    await frame.evaluate(async () => {
      const g = window.__ded.game;
      g.records.descents = 7;
      await g.save.saveRecords();
      g.setMuted(true);
    });
    await page.waitForTimeout(700);
    expect(await hostSave(page)).toEqual(before);
    expect(before.bytes).toEqual(bytes);
  });

  test('the title does nothing when opened outside the Akeru shell', async ({
    page,
  }) => {
    const origin = demo.catalog.entries[0].release.origin;
    const digest = demo.catalog.entries[0].release.digest;
    // A top-level visit is refused by frame-ancestors only for framing; the
    // document itself loads, finds no shell and stops.
    await page.route('**/favicon.ico', (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.goto(`${origin}/releases/${digest}/index.html`);
    await expect(page.locator('#akeru-status')).toHaveText(
      'Open Dead End Dash from the Akeru catalog.',
    );
    expect(await page.evaluate(() => typeof window.__ded)).toBe('undefined');
    expect(await page.locator('#ded-root *').count()).toBe(0);
  });

  test.describe('touch', () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
    test('tappable menus, then Akeru sticks and buttons in the dash', async ({
      page,
    }) => {
      test.setTimeout(120000);
      const frame = await open(page, demo);
      await frame.locator('[data-fid=solo]').tap();
      await frame.locator('[data-fid=dnormal]').tap();
      await expect.poll(async () => (await state(frame)).mode).toBe('huddle');
      await expect(page.locator('#touch-controls')).toBeHidden();
      await frame.locator('[data-fid=dash]').tap();
      await startDash(frame);
      await expect(page.locator('#touch-controls')).toBeVisible();
      // The game's own pad never appears next to Akeru's.
      await expect(frame.locator('.ded-touch')).toBeHidden();
      const stick = page.getByLabel('left thumbstick', { exact: true });
      const box = await stick.boundingBox();
      const centre = [box.x + box.width / 2, box.y + box.height / 2];
      expect(
        await moved(
          frame,
          async (x, y) => {
            await page.mouse.move(...centre);
            await page.mouse.down();
            await page.mouse.move(
              centre[0] + x * box.width * 0.35,
              centre[1] + y * box.height * 0.35,
            );
          },
          () => page.mouse.up(),
        ),
      ).toBeGreaterThan(8);
      // Touching Akeru's controls takes focus from the frame. That is play,
      // not the player leaving: the dash carries on.
      expect((await state(frame)).inPlay).toBe(true);
      await expect.poll(async () => (await state(frame)).mx).toBe(0);
      const a = await page
        .locator('#touch-controls [data-control=south]')
        .boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await expect
        .poll(async () => (await state(frame)).air)
        .toBeGreaterThan(0);
      await page.mouse.up();
      // Akeru's menu button owns the top-right corner, so the game's own
      // pause button is not drawn under it; View still opens the game's menu.
      await expect(frame.locator('.ded-pause')).toBeHidden();
      const view = await page
        .locator('#touch-controls [data-control=select]')
        .boundingBox();
      await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.down();
      await expect.poll(async () => (await state(frame)).screen).toBe('pause');
      await page.mouse.up();
      await expect(page.locator('#touch-controls')).toBeHidden();
    });
  });

  test('two players share a party through the built relay, and it survives the relay restarting', async ({
    page,
    browser,
  }) => {
    test.skip(
      !existsSync(relayEntry),
      'Explicit Dead End Dash party relay build required',
    );
    test.setTimeout(150000);
    const port = await freePort();
    let stopRelay = await startRelay(port);
    const [options] = deadEndDashTitles();
    const party = await startCatalogDemo({
      titles: [withLocalRelay(options, port)],
    });
    const guest = await browser.newPage();
    const session = (frame) =>
      frame.evaluate(() => {
        const s = window.__ded.game.session;
        return s
          ? { status: s.status, members: s.members().length, host: s.isHost }
          : null;
      });
    try {
      const host = await open(page, party);
      const other = await open(guest, party);
      await host.locator('[data-fid=host]').click();
      await expect.poll(async () => (await state(host)).screen).toBe('lobby');
      const code = await host.evaluate(() => window.__ded.game.session.code);
      expect(code).toMatch(/^[A-HJ-NP-Z]{6}$/);
      // The guest joins the way a player does: the code, typed.
      await other.locator('[data-fid=join]').click();
      await expect.poll(async () => (await state(other)).screen).toBe('join');
      await guest.keyboard.type(code, { delay: 30 });
      await other.locator('[data-fid=go]').click();
      await expect.poll(async () => (await state(other)).screen).toBe('lobby');
      await expect.poll(async () => (await session(host)).members).toBe(2);
      await host.locator('[data-fid=start]').click();
      await host.locator('[data-fid=dnormal]').click();
      for (const f of [host, other])
        await expect.poll(async () => (await state(f)).mode).toBe('huddle');
      const seed = await host.evaluate(() => window.__ded.game.h.mz.seed);

      // The relay restarts under them, as it does on every deployment. It
      // holds no game state, so the party and its descent are still theirs.
      await stopRelay();
      await expect
        .poll(async () => (await session(host)).status)
        .toBe('reconnecting');
      stopRelay = await startRelay(port);
      for (const f of [host, other])
        await expect
          .poll(async () => (await session(f)).status, { timeout: 20000 })
          .toBe('open');
      for (const f of [host, other])
        await expect
          .poll(async () => (await session(f)).members, { timeout: 10000 })
          .toBe(2);
      expect(
        [(await session(host)).host, (await session(other)).host].sort(),
      ).toEqual([false, true]);
      for (const f of [host, other])
        expect(await f.evaluate(() => window.__ded.game.h.mz.seed)).toBe(seed);

      const dasher = (await session(host)).host ? host : other;
      await dasher.locator('[data-fid=dash]').click();
      await startDash(host);
      await startDash(other);
      const seen = () =>
        host.evaluate(() => {
          const [r] = [...window.__ded.game.remotes.values()];
          return r ? { x: r.x, y: r.y } : null;
        });
      await expect.poll(seen).not.toBeNull();
      // The guest plays from the keyboard, which stays with the frame. The
      // host must see them leave their start tile, whichever side is open.
      await other.locator('body').click();
      let farthest = 0;
      for (const key of ['KeyD', 'KeyA', 'KeyS', 'KeyW']) {
        const before = await seen();
        await guest.keyboard.down(key);
        await guest.waitForTimeout(500);
        const after = await seen();
        await guest.keyboard.up(key);
        farthest = Math.max(
          farthest,
          Math.hypot(after.x - before.x, after.y - before.y),
        );
        if (farthest > 4) break;
      }
      expect(farthest).toBeGreaterThan(4);
      // A party's dash is shared. Akeru's menu stops the host's own game and
      // input, not the dash: the guest's clock runs on, and the host comes
      // back into the dash rather than behind a pause screen.
      await page.locator('#player-menu').click();
      await expect(page.locator('#runtime-overlay')).toBeVisible();
      await expect.poll(async () => (await state(host)).suspended).toBe(true);
      const then = (await state(other)).clock;
      await guest.waitForTimeout(600);
      expect((await state(other)).clock).toBeGreaterThan(then + 0.4);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(page.locator('#runtime-overlay')).toBeHidden();
      await expect.poll(async () => (await state(host)).inPlay).toBe(true);
      expect((await state(host)).screen).toBeNull();
      expect((await state(host)).clock).toBeGreaterThan(then);
    } finally {
      await guest.close();
      await page.goto('about:blank');
      await party.close();
      await stopRelay();
    }
  });
});
