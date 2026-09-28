import { promotionUrl } from './promotions.js';

const paths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
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
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  external:
    '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  code: '<path d="m8 8-5 4 5 4m8-8 5 4-5 4M14 4l-4 16"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9.5v.01"/>',
  phone:
    '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  bag: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  left: '<path d="M15 5 8 12l7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkle:
    '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/>',
  pause:
    '<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>',
  exit: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5m5-12 4 4-4 4m-8-4h12"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  shrink: '<path d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
export const icon = (name) =>
  `<svg class="console-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;

const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = 'cubic-bezier(.2,.8,.2,1)';

export const artUrl = (entry) => entry.metadata.cover;
export function cover(entry, { label = true, lazy = false } = {}) {
  const art = document.createElement('span');
  art.className = 'console-cover';
  const url = artUrl(entry);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.decoding = 'async';
    if (lazy) image.loading = 'lazy';
    art.append(image);
  } else art.classList.add('cover-fallback');
  const title = document.createElement('span');
  title.className = 'console-cover-title';
  title.textContent = entry.manifest.title;
  if (label || !url) art.append(title);
  return art;
}
export function consoleHeader({ preview = false } = {}) {
  return `<header class="console-header">
    <a class="console-brand" href="/games" aria-label="Backbone Akeru home"><svg viewBox="0 0 140 20" aria-hidden="true"><use href="#backbone-wordmark"/></svg><small>AKERU</small></a>
    <nav class="console-tabs" aria-label="Main"><span class="trigger-hint" aria-hidden="true">LT</span><span class="console-tab-track"><span class="console-tab-pill" aria-hidden="true"></span><button type="button" data-view="play">Home</button><button type="button" data-view="discover">Discover</button><button type="button" data-view="library">Library</button></span><span class="trigger-hint" aria-hidden="true">RT</span></nav>
    <div class="console-tools"><span class="console-preview" ${preview ? '' : 'hidden'} title="Games shown here are not published releases.">PUBLIC PREVIEW</span><button type="button" class="console-tool" data-search aria-label="Search games" title="Search games (Y)">${icon('search')}</button><button type="button" class="console-tool" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode"><span class="console-theme-icon" data-mode="light">${icon('moon')}</span><span class="console-theme-icon" data-mode="dark">${icon('sun')}</span></button><a class="console-tool" href="/settings" aria-label="Settings" title="Settings">${icon('settings')}</a><span class="console-tools-divider" aria-hidden="true"></span><button type="button" class="console-guest" data-profile aria-haspopup="dialog" aria-label="Guest profile"><span class="console-avatar" aria-hidden="true"></span><span class="console-guest-name">Guest</span><span class="console-online" aria-hidden="true"></span></button></div>
  </header>`;
}
/** Web player chrome. Ids and accessible names match the previous toolbar. */
export function runtimeMarkup() {
  return `<div class="runtime-wrap console-runtime" data-state="loading"><div class="runtime-bar"><div class="runtime-brand"><button type="button" class="runtime-home" id="runtime-guide" aria-label="Open game menu" title="Game menu (Start)"><svg class="brand-mark" viewBox="0 0 111 104" aria-hidden="true"><use href="#backbone-mark"/></svg></button><div class="runtime-heading"><h1 id="runtime-title"></h1><p class="runtime-status"><span class="runtime-dot" aria-hidden="true"></span><span data-runtime-state>Loading</span><span class="runtime-session" data-runtime-session></span></p></div></div><div class="runtime-tools" role="group" aria-label="Game tools"><button type="button" id="runtime-controls" class="runtime-tool" aria-label="Controls" title="Controller layout">${icon('controller')}</button><button type="button" id="runtime-pause" class="runtime-tool runtime-tool-wide" aria-label="Pause" title="Pause (Start)">${icon('pause')}<span>Pause</span></button><button type="button" id="runtime-exit" class="runtime-tool runtime-tool-wide" aria-label="Exit" title="Exit game">${icon('exit')}<span>Exit</span></button></div></div><div class="runtime-stage" id="runtime-stage"><div id="runtime-overlay" class="runtime-overlay launch-screen" role="status"><div class="launch-brand" aria-label="Backbone / Akeru"><span class="launch-backbone"><svg viewBox="0 0 111 104" aria-hidden="true"><use href="#backbone-mark"/></svg>BACKBONE</span><span class="launch-reveal"><span class="launch-akeru"><i>/</i> AKERU</span></span></div><h2>Opening game…</h2><p></p></div></div><div class="controls-row"><p class="runtime-note" id="runtime-note">Saves stay on this browser · account sync is not connected</p></div><div id="touch-controls"></div><div id="control-settings"></div></div>`;
}
export function runtimeTool(iconName, label, { id, wide = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `runtime-tool${wide ? ' runtime-tool-wide' : ''}`;
  if (id) button.id = id;
  setRuntimeTool(button, iconName, label);
  return button;
}
export function setRuntimeTool(button, iconName, label, title = label) {
  button.setAttribute('aria-label', label);
  button.title = title;
  button.innerHTML = `${icon(iconName)}${button.classList.contains('runtime-tool-wide') ? `<span>${label}</span>` : ''}`;
}
export function sessionClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
export function consoleFooter({ back = 'Back' } = {}) {
  return `<footer class="console-footer"><div class="console-shortcuts" aria-label="Controller shortcuts"><button type="button" data-shortcut="play" data-nav-skip><kbd class="glyph-a">A</kbd>Select</button><button type="button" data-shortcut="back" data-nav-skip><kbd class="glyph-b">B</kbd>${back}</button><button type="button" data-shortcut="details" data-nav-skip><kbd class="glyph-x">X</kbd>Details</button><button type="button" data-search data-nav-skip><kbd class="glyph-y">Y</kbd>Search</button></div><span class="console-controller-status" aria-live="polite">${icon('controller')}<span data-controller-label>Controller, keyboard or touch</span></span></footer>`;
}
export function animateIn(element, distance = 10, delay = 0) {
  if (!element || reducedMotion()) return;
  element.getAnimations().forEach((a) => a.cancel());
  element.animate(
    [
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 230, easing: EASE, delay, fill: 'backwards' },
  );
}
/** Enter a group of elements with a short cascade. */
export function cascadeIn(
  elements,
  { x = 0, y = 14, step = 34, max = 10, start = 0 } = {},
) {
  if (reducedMotion()) return;
  [...elements].forEach((element, index) => {
    element.getAnimations().forEach((a) => a.cancel());
    element.animate(
      [
        { opacity: 0, transform: `translate(${x}px, ${y}px)` },
        { opacity: 1, transform: 'translate(0, 0)' },
      ],
      {
        duration: 360,
        easing: EASE,
        delay: start + Math.min(index, max) * step,
        fill: 'backwards',
      },
    );
  });
}
/** Slide the active tab pill under the selected tab. */
export function syncTabPill(root, animate = true) {
  const track = root.querySelector('.console-tab-track');
  const pill = root.querySelector('.console-tab-pill');
  if (!track || !pill) return;
  const active = track.querySelector('[data-view][aria-current="page"]');
  track.classList.toggle('has-active', Boolean(active));
  if (!active) return;
  const move = () => {
    pill.style.setProperty('--pill-x', `${active.offsetLeft}px`);
    pill.style.setProperty('--pill-w', `${active.offsetWidth}px`);
  };
  if (animate && !reducedMotion()) move();
  else {
    pill.style.transition = 'none';
    move();
    void pill.offsetWidth;
    pill.style.transition = '';
  }
}
export function describeController(pads) {
  const pad = [...(pads ?? [])].find((p) => p && p.connected);
  if (!pad) return null;
  return /backbone/i.test(pad.id ?? '')
    ? 'Backbone controller connected'
    : 'Controller connected';
}
export function bindConsoleChrome(
  root,
  { onTab, onSearch, sound, entry, profile } = {},
) {
  root.querySelectorAll('.console-header [data-view]').forEach((button) => {
    button.onclick = () => onTab?.(button.dataset.view);
  });
  root.querySelector('.console-header [data-search]').onclick = () =>
    onSearch?.();
  const theme = root.querySelector('.console-header [data-theme-toggle]');
  const sync = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
    theme.setAttribute('aria-label', label);
    theme.title = label;
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  sync();
  const guest = root.querySelector('[data-profile]');
  if (guest)
    guest.onclick = () =>
      openProfilePanel(root.querySelector('.console-shell') ?? root, {
        sound,
        stats: profile?.() ?? {},
        returnFocus: guest,
      });
  const status = root.querySelector('[data-controller-label]');
  let lastStatus = '';
  const pollController = () => {
    if (!status) return;
    let label = null;
    try {
      label = describeController(navigator.getGamepads?.());
    } catch {
      /* Gamepad access can be blocked by policy. */
    }
    const text = label ?? 'Controller, keyboard or touch';
    if (text === lastStatus) return;
    lastStatus = text;
    status.textContent = text;
    status.parentElement.classList.toggle('is-connected', Boolean(label));
  };
  pollController();
  const controllerTimer = setInterval(pollController, 1500);
  addEventListener('gamepadconnected', pollController);
  addEventListener('gamepaddisconnected', pollController);
  const resize = () => syncTabPill(root, false);
  addEventListener('resize', resize);
  document.fonts?.ready.then(resize, () => {});
  const header = root.querySelector('.console-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (entry) setHeaderArt(root, entry);
  return () => {
    observer.disconnect();
    clearInterval(controllerTimer);
    removeEventListener('gamepadconnected', pollController);
    removeEventListener('gamepaddisconnected', pollController);
    removeEventListener('resize', resize);
    removeEventListener('scroll', onScroll);
    root.querySelector('.console-profile')?.remove();
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
  main.innerHTML = `<div class="console-shell console-subpage">${consoleHeader(options)}<div class="console-content"></div><footer class="console-footer console-subpage-footer"><div class="console-shortcuts" aria-label="Controller shortcuts"><span><kbd class="glyph-a">A</kbd>Select</span><span><kbd class="glyph-b">B</kbd>Back</span><span><kbd class="glyph-trigger">LT</kbd><kbd class="glyph-trigger">RT</kbd>Switch pages</span></div></footer></div>`;
  main.querySelector('.console-content').append(...children);
  document.body.classList.add('console-home-active');
  const dispose = bindConsoleChrome(main, options);
  animateIn(main.querySelector('.console-content'));
  return () => {
    dispose();
    document.body.classList.remove('console-home-active');
  };
}
/** Close a console dialog with its exit motion, then remove it. */
export function closeConsoleDialog(dialog, frames, done = () => {}) {
  if (!dialog?.open || dialog.dataset.closing === 'true') return;
  dialog.dataset.closing = 'true';
  const finish = () => {
    dialog.close();
    done();
  };
  if (reducedMotion() || !frames) return finish();
  const target = dialog.firstElementChild ?? dialog;
  const animation = target.animate(frames, {
    duration: 220,
    easing: 'cubic-bezier(.4,0,.8,.3)',
    fill: 'forwards',
  });
  animation.finished.then(finish, finish);
}
export function openProfilePanel(
  host,
  { sound, stats = {}, returnFocus } = {},
) {
  if (document.querySelector('.console-profile')) return null;
  const dialog = document.createElement('dialog');
  dialog.className = 'console-profile';
  dialog.dataset.consoleClose = '';
  dialog.setAttribute('aria-labelledby', 'console-profile-title');
  dialog.innerHTML = `<div class="profile-panel"><div class="profile-head"><span class="console-avatar profile-avatar" aria-hidden="true"></span><div><h2 id="console-profile-title">Guest</h2><p><span class="console-online" aria-hidden="true"></span>Playing as a guest</p></div><button type="button" class="profile-close" data-profile-close aria-label="Close profile"><kbd class="glyph-b">B</kbd></button></div><dl class="profile-stats"><div><dt>In library</dt><dd data-stat="library">0</dd></div><div><dt>Played</dt><dd data-stat="played">0</dd></div><div><dt>Games</dt><dd data-stat="games">0</dd></div></dl><div class="profile-menu"><button type="button" class="profile-row" data-theme-toggle>${icon('moon')}<span>Appearance</span><em data-theme-label>Light</em></button><button type="button" class="profile-row" data-sound-row aria-pressed="true">${icon('sound')}<span>Navigation sounds</span><em data-sound-label>On</em></button><a class="profile-row" href="/settings">${icon('controller')}<span>Controller setup</span><em>${icon('right')}</em></a><a class="profile-row" href="/settings">${icon('settings')}<span>All settings</span><em>${icon('right')}</em></a><hr><a class="profile-row" data-promo="app" target="_blank" rel="noopener noreferrer">${icon('phone')}<span>Get the Backbone app</span><em>${icon('external')}</em></a><a class="profile-row" data-promo="controller" target="_blank" rel="noopener noreferrer">${icon('bag')}<span>Shop Backbone controllers</span><em>${icon('external')}</em></a></div><p class="profile-note">Backbone account sign-in isn’t available in this preview. Your library, saves and settings stay on this device.</p></div>`;
  for (const [key, value] of Object.entries(stats)) {
    const cell = dialog.querySelector(`[data-stat="${key}"]`);
    if (cell && Number.isSafeInteger(value) && value >= 0)
      cell.textContent = String(value);
  }
  for (const link of dialog.querySelectorAll('[data-promo]'))
    link.href = promotionUrl(link.dataset.promo);
  const themeLabel = dialog.querySelector('[data-theme-label]');
  const soundRow = dialog.querySelector('[data-sound-row]');
  const syncRows = () => {
    themeLabel.textContent =
      document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light';
    const on = sound?.enabled ?? false;
    soundRow.setAttribute('aria-pressed', String(on));
    dialog.querySelector('[data-sound-label]').textContent = on ? 'On' : 'Off';
  };
  const observer = new MutationObserver(syncRows);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  syncRows();
  soundRow.onclick = () => {
    sound?.toggle();
    syncRows();
  };
  const exit = [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(48px)', opacity: 0 },
  ];
  const close = () =>
    closeConsoleDialog(dialog, exit, () => {
      dialog.remove();
    });
  dialog.querySelector('[data-profile-close]').onclick = close;
  dialog.addEventListener('console-close', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
    const link = event.target.closest('a[href^="/"]');
    if (link) {
      dialog.close();
      dialog.remove();
    }
  });
  dialog.addEventListener('close', () => {
    observer.disconnect();
    if (!dialog.dataset.closing) dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  host.append(dialog);
  dialog.showModal();
  dialog.querySelector('.profile-row').focus({ preventScroll: true });
  if (!reducedMotion())
    dialog.firstElementChild.animate(
      [
        { transform: 'translateX(56px)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 360, easing: EASE },
    );
  cascadeIn(dialog.querySelectorAll('.profile-row'), { x: 18, y: 0, step: 28 });
  return dialog;
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
