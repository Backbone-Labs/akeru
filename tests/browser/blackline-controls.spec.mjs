import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL(
    '../../packages/operation-blackline/src/controls.js',
    import.meta.url,
  ),
  'utf8',
);
const css = await readFile(
  new URL(
    '../../packages/operation-blackline/src/controls.css',
    import.meta.url,
  ),
  'utf8',
);
// The real adapter runs against a small upstream API fixture. No game download,
// renderer, room worker, simulated Gamepad API, or external network is required.
async function fixture(page) {
  await page.route('https://blackline-controls.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      contentType: path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : 'text/html',
      body:
        path === '/controls.js'
          ? source
          : path === '/controls.css'
            ? css
            : `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/controls.css"><style>html,body{margin:0;background:#252a2b;color:white}[hidden]{display:none!important}</style>
        <div id="gl"></div><div id="scoreboard" hidden>Scoreboard</div>
        <div id="pause-overlay" hidden><button id="btn-resume">Resume</button></div>
        <div id="menu"><button id="settings">Settings</button><input id="sensitivity" type="range" min="1" max="3" value="1" step="1"><section id="akeru-room-panel"><button id="deploy">Deploy</button></section></div>
        <script type="module">
          import {installControls} from './controls.js';
          window.host={active:true};
          window.Game={state:{phase:'menu',settings:{sens:1}},
            player:{_keys:{},_jumpBuf:0,yaw:0,pitch:0,alive:true,_clearKeys(){this._keys={}}},
            weapons:{idx:0,reload(){this.reloaded=true},switchTo(i){this.idx=i}},
            menus:{phase:'menu',hideHint(){},els:{'pause-overlay':document.querySelector('#pause-overlay')}},
            bus:{emit(type){if(type==='ui:pause'){Game.state.phase=Game.menus.phase='pause';document.querySelector('#pause-overlay').hidden=false}}},
            _loopFns:[],onLoop(fn,order){this._loopFns.push({fn,order})}};
          window.controls=installControls(Game,()=>host);
          window.tick=()=>Game._loopFns[0].fn(.016);
          window.deploy=()=>{Game.state.phase=Game.menus.phase='playing';document.querySelector('#menu').hidden=true;tick()};
          document.querySelector('#deploy').onclick=deploy;
          document.querySelector('#btn-resume').onclick=()=>controls.action('cancel');
        </script>`,
    });
  });
  await page.goto('https://blackline-controls.test/');
  await expect.poll(() => page.evaluate(() => !!window.controls)).toBe(true);
}

test('controller reaches room and settings, then sends complete FPS intent', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    window.controls.controllerChanged(true);
    window.controls.input({ buttons: { confirm: 1 }, axes: {} });
    window.controls.action('down');
  });
  await expect(page.locator('#settings')).toBeFocused();
  await page.evaluate(() => window.controls.action('down'));
  await expect(page.locator('#sensitivity')).toBeFocused();
  await page.evaluate(() => window.controls.action('right'));
  await expect(page.locator('#sensitivity')).toHaveValue('2');
  await page.evaluate(() => {
    window.controls.action('down');
    window.controls.action('confirm');
  });
  expect(await page.evaluate(() => window.Game.state.phase)).toBe('playing');
  const intent = await page.evaluate(() => {
    window.controls.input({
      buttons: {
        confirm: 1,
        cancel: 1,
        west: 1,
        leftShoulder: 1,
        rightTrigger: 1,
        leftTrigger: 1,
        view: 1,
      },
      axes: { moveY: -1, lookX: 1 },
    });
    window.controls.action('confirm');
    window.controls.action('west');
    window.controls.action('north');
    window.tick();
    return {
      state: window.Game.akeruControlState,
      keys: window.Game.player._keys,
      yaw: window.Game.player.yaw,
      jump: window.Game.player._jumpBuf,
      reloaded: window.Game.weapons.reloaded,
      trigger: window.Game.weapons._trigger,
      ads: window.Game.weapons._wantAds,
    };
  });
  expect(intent.state).toEqual({
    moveX: 0,
    moveY: -1,
    jump: true,
    crouch: true,
    sprint: true,
    fire: true,
    reload: true,
    ads: true,
    weapon: 1,
  });
  expect(intent.keys).toMatchObject({
    KeyW: true,
    ShiftLeft: true,
    ControlLeft: true,
  });
  expect(intent.yaw).toBeLessThan(0);
  expect(intent.jump).toBe(0.12);
  expect(intent.reloaded && intent.trigger && intent.ads).toBe(true);
  await expect(page.locator('#scoreboard')).toBeVisible();
  await page.keyboard.down('w');
  expect(
    await page.evaluate(() => ({
      custom: window.Game.akeruInputActive,
      forward: window.Game.player._keys.KeyW,
      fire: window.Game.weapons._trigger,
    })),
  ).toEqual({ custom: false, forward: true, fire: false });
  await page.keyboard.up('w');
  await page.evaluate(() => {
    window.controls.action('menu');
    window.tick();
  });
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.locator('#scoreboard')).toBeHidden();
  expect(await page.evaluate(() => window.Game.weapons._trigger)).toBe(false);
});

test('pause, stale host frames, lobby and disconnect neutralize all intent', async ({
  page,
}) => {
  await fixture(page);
  const hold = () =>
    page.evaluate(() => {
      window.controls.input({
        buttons: { rightTrigger: 1 },
        axes: { moveY: -1 },
      });
      window.tick();
    });
  await page.evaluate(() => {
    window.deploy();
    window.controls.controllerChanged(true);
  });
  await hold();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        window.tick();
        return window.Game.akeruControlState.fire;
      }),
    )
    .toBe(false);
  await hold();
  await page.evaluate(() => {
    window.controls.pause(true);
    window.tick();
  });
  expect(
    await page.evaluate(() => ({
      active: window.Game.akeruInputActive,
      fire: window.Game.weapons._trigger,
      move: !!window.Game.player._keys.KeyW,
    })),
  ).toEqual({ active: false, fire: false, move: false });
  await page.evaluate(() => window.controls.pause(false));
  await hold();
  await page.evaluate(() => {
    window.Game.akeruLobbyOpen = true;
    window.tick();
  });
  expect(await page.evaluate(() => window.Game.akeruControlState.fire)).toBe(
    false,
  );
  await page.evaluate(() => {
    window.Game.akeruLobbyOpen = false;
    window.controls.controllerChanged(false);
    window.tick();
  });
  expect(
    await page.evaluate(() => ({
      phase: window.Game.state.phase,
      fire: window.Game.weapons._trigger,
      move: !!window.Game.player._keys.KeyW,
    })),
  ).toEqual({ phase: 'pause', fire: false, move: false });
  await page.evaluate(() => {
    window.host.active = false;
    window.controls.action('cancel');
    window.controls.input({
      buttons: { rightTrigger: 1 },
      axes: { moveY: -1 },
    });
    window.tick();
  });
  expect(await page.evaluate(() => window.Game.state.phase)).toBe('pause');
});

test('simultaneous touch move and fire release safely on pointer cancellation', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Concurrent hardware touch injection uses Chromium DevTools. Other adapter behavior is cross-browser.',
  );
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await fixture(page);
    await page.evaluate(() => window.deploy());
    await expect(page.locator('#akeru-fps-controls')).toBeVisible();
    const move = await page.locator('.fps-move').boundingBox();
    const fire = await page.locator('[data-fps="fire"]').boundingBox();
    expect(move.x + move.width).toBeLessThan(fire.x);
    const cdp = await context.newCDPSession(page);
    const first = { x: move.x + move.width / 2, y: move.y + 8, id: 1 };
    const second = {
      x: fire.x + fire.width / 2,
      y: fire.y + fire.height / 2,
      id: 2,
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first, second],
    });
    const held = await page.evaluate(() => {
      window.tick();
      return window.Game.akeruControlState;
    });
    expect(held.moveY).toBeLessThan(-0.9);
    expect(held.fire).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    expect(
      await page.evaluate(() => {
        window.tick();
        return {
          move: !!window.Game.player._keys.KeyW,
          fire: window.Game.weapons._trigger,
        };
      }),
    ).toEqual({ move: false, fire: false });
    await page.evaluate(() => window.controls.dispose());
    await expect(page.locator('#akeru-fps-controls')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
