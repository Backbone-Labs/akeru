/** Title-owned controller/touch adapter. Only authenticated host frames enter here. */
export function installControls(game, getHost) {
  const abort = new AbortController();
  const listen = (target, event, fn, options = {}) =>
    target.addEventListener(event, fn, { ...options, signal: abort.signal });
  const root = document.createElement('div');
  root.id = 'akeru-fps-controls';
  root.setAttribute('aria-label', 'Touch controls');
  root.innerHTML = `
    <div class="fps-utility"><button type="button" data-fps="menu">Menu</button><button type="button" data-fps="score">Score</button></div>
    <div class="fps-stick fps-move" role="group" aria-label="Move joystick"><span>MOVE</span><i></i></div>
    <div class="fps-stick fps-look" role="group" aria-label="Look joystick"><span>LOOK</span><i></i></div>
    <div class="fps-left-actions"><button type="button" data-fps="sprint">Sprint</button><button type="button" data-fps="ads">Aim</button></div>
    <div class="fps-right-actions"><button type="button" data-fps="fire">Fire</button><button type="button" data-fps="jump">Jump</button><button type="button" data-fps="reload">Reload</button><button type="button" data-fps="crouch">Crouch</button><button type="button" data-fps="weapon">Weapon</button></div>`;
  document.body.append(root);
  const touchButtons = new Map();
  const sticks = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
  const keyboard = new Set();
  const ownedKeys = new Set();
  let frame = { buttons: {}, axes: {} };
  let lastInput = -Infinity;
  let paused = false;
  let disposed = false;
  let connected = false;
  let inputMode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  let wasFire = false;
  let ownedWeapon = false;
  let ownedScore = false;
  const neutralState = () => ({
    moveX: 0,
    moveY: 0,
    jump: false,
    crouch: false,
    sprint: false,
    fire: false,
    reload: false,
    ads: false,
    weapon: game.weapons.idx,
  });
  game.akeruControlState = neutralState();
  const active = () =>
    !disposed && !paused && !document.hidden && !!getHost()?.active;
  const playing = () =>
    active() && game.state.phase === 'playing' && !game.akeruLobbyOpen;
  const clamp = (n) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
  const axis = (n) => (Math.abs(clamp(n)) < 0.16 ? 0 : clamp(n));
  const held = (name) => [...touchButtons.values()].includes(name);
  const button = (name) => Number(frame.buttons[name]) > 0.5;
  const setKey = (code, down) => {
    if (down) {
      ownedKeys.add(code);
      game.player._keys[code] = true;
    } else if (ownedKeys.delete(code)) {
      game.player._keys[code] = keyboard.has(code);
    }
  };
  function release() {
    game.akeruControlState = neutralState();
    frame = { buttons: {}, axes: {} };
    touchButtons.clear();
    for (const stick of Object.values(sticks)) {
      stick.x = stick.y = 0;
      stick.id = undefined;
    }
    root
      .querySelectorAll('i')
      .forEach((el) => el.style.removeProperty('transform'));
    root
      .querySelectorAll('[data-held]')
      .forEach((el) => delete el.dataset.held);
    for (const code of [...ownedKeys]) setKey(code, false);
    if (ownedWeapon) {
      game.weapons._trigger = false;
      game.weapons._semiQueued = false;
      game.weapons._wantAds = false;
    }
    ownedWeapon = wasFire = false;
    if (ownedScore) document.querySelector('#scoreboard').hidden = true;
    ownedScore = false;
    game.akeruInputActive = false;
  }
  function mode(next) {
    inputMode = next;
    document.body.dataset.fpsInput = next;
    if (next !== 'mouse' && active()) {
      game.akeruInputActive = true;
      game.menus.hideHint();
    }
  }
  function menuControls() {
    const selectors = [
      '#pause-overlay',
      '#end-screen',
      '#menu',
      '#akeru-room-panel',
    ];
    const shown = (el) =>
      el &&
      !el.closest('[hidden]') &&
      el.getClientRects().length &&
      getComputedStyle(el).visibility !== 'hidden';
    const scope = selectors.map((s) => document.querySelector(s)).find(shown);
    return scope
      ? [
          ...scope.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
          ),
        ].filter(shown)
      : [];
  }
  function navigate(name) {
    const controls = menuControls();
    if (!controls.length) return;
    const focused = document.activeElement;
    let index = controls.indexOf(focused);
    if (
      (name === 'left' || name === 'right') &&
      focused?.matches('input[type="range"]')
    ) {
      name === 'left' ? focused.stepDown() : focused.stepUp();
      focused.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (name === 'confirm') {
      if (index < 0)
        index = controls.findIndex((el) => el.tagName === 'BUTTON');
      const control = controls[Math.max(0, index)];
      control.focus();
      if (control.tagName === 'BUTTON' || control.tagName === 'A')
        control.click();
      return;
    }
    const direction = name === 'up' || name === 'left' ? -1 : 1;
    index =
      index < 0 ? 0 : (index + direction + controls.length) % controls.length;
    controls[index].focus();
    controls[index].scrollIntoView({ block: 'nearest' });
  }
  function resume() {
    if (game.menus.phase !== 'pause') return;
    game.menus.phase = game.state.phase = 'playing';
    game.menus.els['pause-overlay'].hidden = true;
    game.bus.emit('ui:resume');
  }
  function action(name) {
    if (!active()) return;
    if (name === 'menu') {
      if (game.state.phase === 'playing') {
        release();
        game.bus.emit('ui:pause');
      } else resume();
      return;
    }
    if (game.state.phase !== 'playing' || game.akeruLobbyOpen) {
      if (name === 'cancel') resume();
      else if (['confirm', 'up', 'down', 'left', 'right'].includes(name))
        navigate(name);
      return;
    }
    if (!game.player.alive) return;
    if (name === 'confirm' || name === 'jump') game.player._jumpBuf = 0.12;
    if (name === 'west' || name === 'reload') game.weapons.reload();
    if (['north', 'rightShoulder', 'weapon'].includes(name))
      game.weapons.switchTo((game.weapons.idx + 1) % 3);
  }
  for (const name of ['move', 'look']) {
    const el = root.querySelector(`.fps-${name}`);
    const stick = sticks[name];
    const move = (event) => {
      if (stick.id !== event.pointerId) return;
      const radius = el.clientWidth / 2;
      const rect = el.getBoundingClientRect();
      let x = (event.clientX - rect.left - radius) / (radius * 0.65);
      let y = (event.clientY - rect.top - radius) / (radius * 0.65);
      const length = Math.max(1, Math.hypot(x, y));
      x /= length;
      y /= length;
      stick.x = x;
      stick.y = y;
      el.querySelector('i').style.transform =
        `translate(${x * radius * 0.65}px, ${y * radius * 0.65}px)`;
    };
    listen(el, 'pointerdown', (event) => {
      event.preventDefault();
      if (!playing() || stick.id !== undefined) return;
      mode('touch');
      stick.id = event.pointerId;
      el.setPointerCapture(event.pointerId);
      move(event);
    });
    listen(el, 'pointermove', move);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(el, event, (e) => {
        if (stick.id !== e.pointerId) return;
        stick.x = stick.y = 0;
        stick.id = undefined;
        el.querySelector('i').style.removeProperty('transform');
      });
  }
  for (const el of root.querySelectorAll('[data-fps]')) {
    listen(el, 'pointerdown', (event) => {
      event.preventDefault();
      if (!playing()) return;
      mode('touch');
      el.setPointerCapture(event.pointerId);
      touchButtons.set(event.pointerId, el.dataset.fps);
      el.dataset.held = 'true';
      action(el.dataset.fps);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(el, event, (e) => {
        touchButtons.delete(e.pointerId);
        delete el.dataset.held;
      });
    // Native keyboard activation remains useful with switch access / external keyboards.
    listen(el, 'click', (e) => {
      if (e.detail === 0) action(el.dataset.fps);
    });
  }
  listen(window, 'keydown', (e) => {
    if (e.target?.matches('input,textarea,select,[contenteditable]')) return;
    keyboard.add(e.code);
    if (
      playing() &&
      inputMode !== 'mouse' &&
      /^(Key[WASDCR]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Digit[123])$/.test(
        e.code,
      )
    ) {
      release();
      mode('mouse');
    }
    if (e.code === 'Escape' && playing() && !document.pointerLockElement)
      action('menu');
  });
  listen(window, 'keyup', (e) => keyboard.delete(e.code));
  listen(
    document,
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') mode('touch');
      else if (e.target instanceof Element && e.target.closest('#gl')) {
        release();
        mode('mouse');
      }
    },
    { capture: true },
  );
  const blur = () => {
    keyboard.clear();
    release();
    game.player._clearKeys();
  };
  listen(window, 'blur', blur);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) blur();
  });
  const tick = (delta) => {
    if (disposed) return;
    if (performance.now() - lastInput > 300) frame = { buttons: {}, axes: {} };
    root.hidden = !playing() || inputMode !== 'touch';
    const controlling = playing() && inputMode !== 'mouse';
    game.akeruInputActive = active() && inputMode !== 'mouse';
    if (!controlling) {
      game.akeruControlState = neutralState();
      if (ownedScore) document.querySelector('#scoreboard').hidden = true;
      ownedScore = false;
      for (const code of [...ownedKeys]) setKey(code, false);
      if (ownedWeapon) {
        game.weapons._trigger =
          game.weapons._semiQueued =
          game.weapons._wantAds =
            false;
        ownedWeapon = wasFire = false;
      }
      return;
    }
    game.menus.hideHint();
    const x = axis(sticks.move.x || frame.axes.moveX);
    const y = axis(sticks.move.y || frame.axes.moveY);
    setKey('KeyA', x < -0.16);
    setKey('KeyD', x > 0.16);
    setKey('KeyW', y < -0.16);
    setKey('KeyS', y > 0.16);
    setKey(
      'ShiftLeft',
      held('sprint') || button('leftShoulder') || button('leftStick'),
    );
    setKey(
      'ControlLeft',
      held('crouch') || button('cancel') || button('rightStick'),
    );
    const dt = Math.min(0.05, Math.max(0, delta || 0));
    const sensitivity = Math.min(
      3,
      Math.max(0.2, game.state.settings.sens || 1),
    );
    const ads = held('ads') || button('leftTrigger');
    const speed = sensitivity * (ads ? 1.1 : 2.3) * dt;
    game.player.yaw -= axis(sticks.look.x || frame.axes.lookX) * speed;
    game.player.yaw = Math.atan2(
      Math.sin(game.player.yaw),
      Math.cos(game.player.yaw),
    );
    game.player.pitch = Math.max(
      -1.51,
      Math.min(
        1.51,
        game.player.pitch - axis(sticks.look.y || frame.axes.lookY) * speed,
      ),
    );
    const fire = held('fire') || button('rightTrigger');
    game.akeruControlState = {
      moveX: x,
      moveY: y,
      jump: held('jump') || button('confirm'),
      crouch: held('crouch') || button('cancel') || button('rightStick'),
      sprint: held('sprint') || button('leftShoulder') || button('leftStick'),
      fire,
      reload: held('reload') || button('west'),
      ads,
      weapon: game.weapons.idx,
    };
    game.weapons._trigger = fire;
    if (fire && !wasFire) game.weapons._semiQueued = true;
    game.weapons._wantAds = ads;
    ownedWeapon = true;
    wasFire = fire;
    const score = held('score') || button('view');
    if (score || ownedScore)
      document.querySelector('#scoreboard').hidden = !score;
    ownedScore = score;
  };
  game.onLoop(tick, 5);
  mode(inputMode);
  root.hidden = true;
  return {
    input(next) {
      if (!active()) return release();
      frame = { buttons: next.buttons || {}, axes: next.axes || {} };
      lastInput = performance.now();
      if (
        Object.values(frame.buttons).some((n) => n > 0.5) ||
        Object.values(frame.axes).some((n) => Math.abs(n) > 0.16)
      )
        mode('controller');
    },
    action,
    pause(value) {
      paused = value;
      if (value) blur();
    },
    controllerChanged(value) {
      if (connected && !value) {
        blur();
        if (game.state.phase === 'playing') game.bus.emit('ui:pause');
        mode(matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
      }
      connected = value;
    },
    dispose() {
      release();
      disposed = true;
      abort.abort();
      root.remove();
      const index = game._loopFns?.findIndex((entry) => entry.fn === tick);
      if (index >= 0) game._loopFns.splice(index, 1);
    },
  };
}
