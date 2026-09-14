const KEY = 'akeru.onboarding.v1';
export function controllerIdentity(controllers, gamepads = []) {
  if (!controllers.length) return null;
  const recognized = controllers.find((controller) =>
    /\bbackbone\b/i.test(gamepads[controller.index]?.id ?? ''),
  );
  return recognized ? 'Backbone' : 'Controller';
}
export function needsOnboarding(storage) {
  try {
    return storage?.getItem(KEY) !== 'complete';
  } catch {
    return true;
  }
}
/** Host-owned first-run UI. Device names never leave this page. */
export function mountOnboarding({ input, onComplete, modelUrl = null }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'onboarding';
  dialog.setAttribute('aria-labelledby', 'onboarding-title');
  document.body.append(dialog);
  let step = 0,
    timer,
    stopModel,
    finished = false,
    identity = null;
  let controllerKey = '',
    inputConfirmed = false,
    wasEngaged = false;
  const complete = () => {
    if (finished) return;
    finished = true;
    try {
      localStorage.setItem(KEY, 'complete');
    } catch {
      /* Guest play works without storage. */
    }
    dispose();
    document.body.classList.add('onboarding-arrival');
    onComplete();
  };
  const dispose = () => {
    clearInterval(timer);
    stopModel?.();
    dialog.remove();
  };
  const poll = () => {
    let pads = [];
    try {
      pads = Array.from(navigator.getGamepads?.() ?? []);
    } catch {
      /* Browser policy may block gamepads. */
    }
    input?.refreshControllers?.();
    const state = input?.getState?.();
    identity = controllerIdentity(state?.controllers ?? [], pads);
    const supportedPads = (state?.controllers ?? [])
      .map((c) => pads[c.index])
      .filter(Boolean);
    const nextKey = supportedPads.map((p) => `${p.index}:${p.id}`).join('|');
    const engaged = supportedPads.some(
      (p) =>
        Array.from(p.buttons ?? []).some((b) => (b.value ?? 0) > 0.5) ||
        Array.from(p.axes ?? []).some((a) => Math.abs(a) > 0.65),
    );
    if (nextKey !== controllerKey) {
      controllerKey = nextKey;
      inputConfirmed = false;
      wasEngaged = engaged;
    } else if (engaged && !wasEngaged) inputConfirmed = true;
    wasEngaged = engaged;
    const unsupported =
      !identity &&
      pads.some((p) => p && p.connected !== false && p.mapping !== 'standard');
    const status = dialog.querySelector('.connection-status');
    if (!status) return;
    const unavailable =
      state?.gamepad === 'unavailable' || !navigator.getGamepads;
    const text = identity
      ? `${identity} connected`
      : unsupported
        ? 'Controller detected'
        : unavailable
          ? 'Controller detection unavailable'
          : 'Waiting for your controller';
    if (status.textContent !== text) status.textContent = text;
    dialog.classList.toggle('controller-connected', !!identity);
    dialog.querySelector('#controller-next').textContent = identity
      ? 'Continue →'
      : 'Continue without a controller';
    const hint = identity
      ? inputConfirmed
        ? 'Input confirmed. You’re ready to play.'
        : 'Connected. Press a button or move a stick to check your input.'
      : unsupported
        ? 'This controller does not report a standard layout. You can continue with touch or try another controller.'
        : unavailable
          ? 'You can still play with keyboard, mouse or touch.'
          : 'Already connected? Press any controller button so your browser can recognize it.';
    const hintNode = dialog.querySelector('.connection-hint');
    if (hintNode.textContent !== hint) hintNode.textContent = hint;
  };
  const render = () => {
    clearInterval(timer);
    stopModel?.();
    stopModel = null;
    dialog.classList.remove('controller-connected');
    dialog.innerHTML = `<div class="onboarding-top"><span class="onboarding-brand">BACKBONE <span>/ AKERU</span></span><button class="text-button onboarding-skip">Skip setup</button></div><div class="onboarding-body" data-step="${step}"></div><div class="onboarding-bottom"><button class="text-button onboarding-back" ${step === 0 ? 'hidden' : ''}>← Back</button><span class="onboarding-progress" aria-label="Step ${step + 1} of 3">${[0, 1, 2].map((i) => `<span class="${i === step ? 'current' : ''}"></span>`).join('')}</span><span>0${step + 1} / 03</span></div>`;
    const body = dialog.querySelector('.onboarding-body');
    const theme = document.createElement('button');
    theme.className = 'text-button theme-toggle';
    theme.type = 'button';
    theme.textContent = 'Light / Dark';
    theme.setAttribute('data-theme-toggle', '');
    theme.setAttribute('aria-label', 'Switch light or dark theme');
    dialog
      .querySelector('.onboarding-top')
      .insertBefore(theme, dialog.querySelector('.onboarding-skip'));
    if (step === 0) {
      body.innerHTML =
        '<div class="onboarding-emblem" aria-hidden="true"><svg viewBox="0 0 111 104"><use href="#backbone-mark"/></svg></div><p class="eyebrow">A LITTLE SPACE FOR PLAY</p><h1 id="onboarding-title" tabindex="-1">Good games.<br>Wide open.</h1><p class="onboarding-copy">Free games, right in your browser.<br>No downloads. No membership. Just play.</p><button class="primary onboarding-next">Let’s get started <span>→</span></button><p class="onboarding-fine">Made for your controller. Ready for touch.</p>';
    } else if (step === 1) {
      body.innerHTML =
        '<div class="controller-visual" aria-label="Backbone controller illustration"><div class="controller-fallback" aria-hidden="true"><div class="controller-grip left"><i></i><b>+</b></div><div class="controller-bridge">BACKBONE</div><div class="controller-grip right"><b>●<br>● ●<br>●</b><i></i></div></div></div><p class="eyebrow">PLAY YOUR WAY</p><h1 id="onboarding-title" tabindex="-1">Connect your Backbone.</h1><p class="onboarding-copy">Plug in with USB, or pair over Bluetooth.<br>We’ll recognize it when it’s ready.</p><p class="connection-status" role="status"></p><p class="connection-hint" aria-live="polite"></p><details class="pairing-help"><summary>Need help connecting?</summary><p>For Backbone Pro wireless play, hold the Pair button on the bottom left, next to the headphone port, until the LED blinks blue rapidly. Open your device’s Bluetooth settings and choose Backbone Pro. Return here and press a controller button.</p><p>Your browser can recognize a connected controller, but pairing happens in your device settings. Other controllers work too when your browser supports them.</p></details><button id="controller-next" class="primary onboarding-next">Continue with touch</button>';
      poll();
      timer = setInterval(poll, 300);
      if (modelUrl) {
        const target = dialog.querySelector('.controller-visual');
        import('./controller-model.js')
          .then(async ({ mountControllerModel }) => {
            if (!target.isConnected) return;
            const cleanup = await mountControllerModel(target, modelUrl);
            if (!target.isConnected) cleanup();
            else stopModel = cleanup;
          })
          .catch(() => {
            /* Illustration stays visible if 3D is unavailable. */
          });
      }
    } else {
      body.innerHTML =
        '<div class="onboarding-emblem small-emblem" aria-hidden="true"><svg viewBox="0 0 111 104"><use href="#backbone-mark"/></svg></div><p class="eyebrow">MAKE YOURSELF AT HOME</p><h1 id="onboarding-title" tabindex="-1">Come as you are.</h1><p class="onboarding-copy">You don’t need an account to play.<br>Start exploring. Your next game is waiting.</p><button class="primary guest-start">Play as a guest <span>→</span></button><button class="secondary backbone-signin">Use Backbone ID</button><p class="onboarding-fine">Guest saves stay in this browser.</p><p class="account-availability" role="status" hidden>Backbone ID sign-in is not available in this preview. You can play as a guest; account linking and cloud saves will come later.</p>';
      body.querySelector('.guest-start').onclick = complete;
      body.querySelector('.backbone-signin').onclick = () => {
        body.querySelector('.account-availability').hidden = false;
      };
    }
    dialog.querySelector('.onboarding-next')?.addEventListener('click', () => {
      step++;
      render();
    });
    dialog.querySelector('.onboarding-skip').onclick = complete;
    dialog.querySelector('.onboarding-back').onclick = () => {
      step--;
      render();
    };
    dialog.querySelector('h1').focus();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    complete();
  });
  render();
  dialog.showModal();
  dialog.querySelector('h1').focus();
  return {
    dispose,
    back: () => {
      if (step) {
        step--;
        render();
      } else complete();
    },
  };
}
