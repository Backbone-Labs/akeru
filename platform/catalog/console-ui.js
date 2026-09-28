const paths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sound:
    '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>',
  library: '<path d="M3 3h4v18H3zM9 3h4v18H9zM15 4l4-1 4 17-4 1z"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6"/>',
  controller:
    '<path d="M8 6h8c4 0 5 3 6 11 .4 3-2 4-4 2l-3-3H9l-3 3c-2 2-4.4 1-4-2C3 9 4 6 8 6Z"/><path d="M7 9v6m-3-3h6m6-2h.01m3 3h.01"/>',
  keyboard:
    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12"/>',
  touch:
    '<path d="M8 12V4a2 2 0 0 1 4 0v7-3l3 1 3 1 3 2v7c0 3-3 4-6 4h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2Z"/>',
  settings:
    '<path d="m10 2-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  guest: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  people:
    '<circle cx="12" cy="6" r="3"/><path d="M7 19v-3a5 5 0 0 1 10 0v3M5 5a3 3 0 0 0 0 6m14-6a3 3 0 0 1 0 6M3 14l-1 5h3m16-5 1 5h-3"/>',
  play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke-linejoin="round"/>',
};
export const icon = (name) =>
  `<svg class="console-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;

export const artUrl = (entry) => entry.metadata.cover;
export function cover(entry, { label = true } = {}) {
  const art = document.createElement('span');
  art.className = 'console-cover';
  const url = artUrl(entry);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.decoding = 'async';
    art.append(image);
  } else art.classList.add('cover-fallback');
  const title = document.createElement('span');
  title.className = 'console-cover-title';
  title.textContent = entry.manifest.title;
  if (label || !url) art.append(title);
  return art;
}
export function consoleHeader({ preview = false, brand = 'backbone' } = {}) {
  return `<header class="console-header">
    <img class="console-header-art" alt="" hidden>
    ${brand === 'akeru' ? '<a class="console-akeru" href="/games" aria-label="Akeru by Backbone home"><strong>akeru</strong><small>BY BACKBONE</small></a>' : '<a class="console-backbone" href="/games" aria-label="Backbone Akeru home"><svg viewBox="0 0 111 104" aria-hidden="true"><use href="#backbone-mark"/></svg><span><svg viewBox="0 0 140 20" aria-hidden="true"><use href="#backbone-wordmark"/></svg><small>AKERU</small></span></a>'}
    <nav class="console-tabs" aria-label="Main"><span class="trigger-hint" aria-hidden="true">LT</span><button data-view="play">Home</button><button data-view="discover">Discover</button><button data-view="library">Library</button><span class="trigger-hint" aria-hidden="true">RT</span></nav>
    <div class="console-tools"><button class="console-tool" data-search aria-label="Search games" title="Search games (Y)">${icon('search')}</button><a class="console-tool" href="/settings" aria-label="Controller setup" title="Controller setup">${icon('controller')}</a><a class="console-tool" href="/settings" aria-label="Settings" title="Settings">${icon('settings')}</a><button class="console-tool" data-theme-toggle aria-label="Switch to light mode" title="Switch appearance">${icon('sun')}</button><button class="console-tool" data-sound aria-label="Mute navigation sounds" aria-pressed="true" title="Navigation sounds">${icon('sound')}</button></div>
    <div class="console-account"><a class="console-guest" href="/settings" aria-label="Guest account settings"><span class="console-avatar">${icon('guest')}</span><span>Guest</span></a><time class="console-clock"></time><span class="console-preview" ${preview ? '' : 'hidden'} title="Games shown here are not published releases.">PUBLIC PREVIEW</span></div>
  </header>`;
}
export function animateIn(element, distance = 10) {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return;
  element.getAnimations().forEach((a) => a.cancel());
  element.animate(
    [
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}
export function bindConsoleChrome(
  root,
  { onTab, onSearch, sound, entry } = {},
) {
  root.querySelectorAll('.console-header [data-view]').forEach((button) => {
    button.onclick = () => onTab?.(button.dataset.view);
  });
  root.querySelector('.console-header [data-search]').onclick = () =>
    onSearch?.();
  const soundButton = root.querySelector('[data-sound]');
  const sync = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const theme = root.querySelector('[data-theme-toggle]');
    theme.setAttribute(
      'aria-label',
      `Switch to ${dark ? 'light' : 'dark'} mode`,
    );
    theme.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
    soundButton.setAttribute('aria-pressed', String(sound?.enabled ?? false));
    soundButton.setAttribute(
      'aria-label',
      sound?.enabled ? 'Mute navigation sounds' : 'Enable navigation sounds',
    );
  };
  soundButton.onclick = () => {
    sound?.toggle();
    sync();
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  sync();
  const clock = root.querySelector('.console-clock');
  const tick = () => {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
  };
  tick();
  const timer = setInterval(tick, 30_000);
  if (entry) setHeaderArt(root, entry);
  return () => {
    clearInterval(timer);
    observer.disconnect();
  };
}
export function setHeaderArt(root, entry) {
  const image = root.querySelector('.console-header-art');
  if (!image) return;
  const src = artUrl(entry);
  image.hidden = !src;
  if (src && image.getAttribute('src') !== src) image.src = src;
}
export function wrapConsolePage(main, options) {
  const children = [...main.childNodes];
  main.innerHTML = `<div class="console-shell console-subpage"><div class="console-body">${consoleHeader(options)}<div class="console-content"></div><footer class="console-footer"><span><kbd>B</kbd> Back</span><span>LT / RT · Switch pages</span></footer></div></div>`;
  main.querySelector('.console-content').append(...children);
  document.body.classList.add('console-home-active');
  const dispose = bindConsoleChrome(main, options);
  animateIn(main.querySelector('.console-content'));
  return () => {
    dispose();
    document.body.classList.remove('console-home-active');
  };
}
// Spatial navigation follows the visible layout instead of DOM/tab order.
export function directionalTarget(targets, current, direction) {
  if (!targets.length) return null;
  if (!targets.includes(current))
    return (
      targets.find((e) => e.matches('[data-console-primary]')) ?? targets[0]
    );
  const origin = current.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const cx = origin.x + origin.width / 2,
    cy = origin.y + origin.height / 2;
  let winner = null,
    best = Infinity;
  for (const candidate of targets) {
    if (candidate === current) continue;
    const r = candidate.getBoundingClientRect();
    const dx = r.x + r.width / 2 - cx,
      dy = r.y + r.height / 2 - cy;
    const forward = (horizontal ? dx : dy) * sign;
    if (forward < 4) continue;
    const sideways = Math.abs(horizontal ? dy : dx);
    const overlap = horizontal
      ? r.top < origin.bottom && r.bottom > origin.top
      : r.left < origin.right && r.right > origin.left;
    const score = forward + sideways * 2 + (overlap ? 0 : 500);
    if (score < best) {
      best = score;
      winner = candidate;
    }
  }
  return winner ?? current;
}
export function createConsoleSound(
  storage,
  audioFactory = () => new AudioContext(),
) {
  let enabled = true,
    context = null,
    last = -Infinity,
    disposed = false;
  try {
    enabled = storage?.getItem('akeru.ui-sound') !== 'off';
  } catch {
    /* Optional preference. */
  }
  const unlock = () => {
    if (!enabled || disposed) return;
    try {
      context ??= audioFactory();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  };
  const play = (kind = 'move') => {
    if (!enabled || !context || context.state !== 'running' || disposed) return;
    const now = context.currentTime;
    if (now - last < 0.045) return;
    last = now;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'activate' ? 720 : 490, now);
    oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.065);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  };
  return {
    get enabled() {
      return enabled;
    },
    unlock,
    play,
    toggle() {
      enabled = !enabled;
      try {
        storage?.setItem('akeru.ui-sound', enabled ? 'on' : 'off');
      } catch {
        /* Optional. */
      }
      if (enabled) {
        unlock();
        play('activate');
      }
    },
    dispose() {
      disposed = true;
      if (context && context.state !== 'closed')
        void context.close().catch(() => {});
    },
  };
}

export function openConsoleKeyboard(input) {
  if (document.querySelector('.console-keyboard')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'console-keyboard';
  dialog.setAttribute('aria-label', 'Search with controller');
  dialog.innerHTML =
    '<div class="console-keyboard-top"><h2>Find your next game</h2><button data-done>Done</button></div><output aria-live="polite"></output><div class="console-keys"></div><p>D-pad to move · A to type · B to return</p>';
  const output = dialog.querySelector('output');
  const sync = () => {
    output.textContent = input.value || 'Search games…';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  for (const character of [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'Space',
    'Delete',
    'Clear',
  ]) {
    const button = document.createElement('button');
    button.textContent = character;
    button.onclick = () => {
      input.value =
        character === 'Delete'
          ? input.value.slice(0, -1)
          : character === 'Clear'
            ? ''
            : (
                input.value +
                (character === 'Space' ? ' ' : character.toLowerCase())
              ).slice(0, input.maxLength);
      sync();
    };
    dialog.querySelector('.console-keys').append(button);
  }
  dialog.querySelector('[data-done]').onclick = () => dialog.close();
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      if (input.isConnected) input.focus();
    },
    { once: true },
  );
  input.closest('.console-shell').append(dialog);
  sync();
  dialog.showModal();
  dialog.querySelector('.console-keys button').focus();
  animateIn(dialog);
}
