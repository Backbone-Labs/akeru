import {
  CATEGORIES,
  validateCatalog,
  routeFor,
  titleUrl,
  filterEntries,
  createShellTelemetry,
} from './model.js';
import { createRuntimeChannel } from './channel.js';
const $ = (selector) => document.querySelector(selector);
const node = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
function link(label, url) {
  const e = node('a', '', label);
  e.href = url;
  e.target = '_blank';
  e.rel = 'noopener noreferrer';
  return e;
}
function list(items) {
  const ul = node('ul');
  for (const item of items) ul.append(node('li', '', item));
  return ul;
}
async function fetchRegistry() {
  const response = await fetch('/catalog.json', {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    throw new Error('Catalog unavailable');
  let size = 0,
    parts = [];
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) {
        await reader.cancel();
        throw new Error('Catalog too large');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
/** Services are trusted shell integrations, never package-defined capabilities. */
export function mountCatalog({
  mode = 'production',
  inputProviderFactory,
  telemetrySink,
  loadCatalog = fetchRegistry,
} = {}) {
  const main = $('#main'),
    emit = createShellTelemetry(telemetrySink);
  let catalog,
    active = null,
    input = null,
    navInput = null,
    disposed = false,
    loadVersion = 0;
  let filters = { category: 'all', controller: false, query: '' };
  let controlsTimer = null;
  function stopControlsMonitor() {
    clearInterval(controlsTimer);
    controlsTimer = null;
  }
  $('#demo-banner').hidden = mode !== 'demo';
  const onMessage = (e) => active?.channel?.receive(e);
  window.addEventListener('message', onMessage);
  const onVisibility = () => {
    if (document.hidden && active?.channel?.state === 'playable') pause();
  };
  document.addEventListener('visibilitychange', onVisibility);
  function telemetry(event) {
    try {
      emit(event);
    } catch {
      /* An unavailable metrics sink must not block play. */
    }
  }
  function clearSession() {
    stopControlsMonitor();
    loadVersion++;
    navInput?.dispose();
    navInput = null;
    if (active) {
      active.channel?.dispose();
      active.frame?.remove();
      telemetry({ type: 'sessionExit', titleId: active.entry.manifest.id });
      active = null;
    }
    input?.dispose();
    input = null;
  }
  function nav(event) {
    const modal = document.querySelector('dialog[open]');
    if (modal && ['back', 'menu'].includes(event.type)) {
      modal.close();
      return;
    }
    if (event.type === 'back') {
      if (active) navigate(`/g/${active.entry.manifest.id}`);
      else if (routeFor(location.pathname).view !== 'catalog') navigate('/');
      return;
    }
    if (event.type === 'menu') {
      if (active) {
        if (active.channel.state === 'paused') resume();
        else pause();
      } else $('#about-dialog').showModal();
      return;
    }
    const scope =
      modal ?? (active ? document.querySelector('.runtime-wrap') : main);
    if (
      event.type === 'move' &&
      document.activeElement?.tagName === 'SELECT' &&
      ['left', 'right'].includes(event.direction)
    ) {
      const select = document.activeElement;
      select.selectedIndex = Math.max(
        0,
        Math.min(
          select.options.length - 1,
          select.selectedIndex + (event.direction === 'left' ? -1 : 1),
        ),
      );
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const targets = [
      ...scope.querySelectorAll('a[href],button:not([disabled]),input,select'),
    ].filter((e) => !e.closest('[hidden]') && e.getClientRects().length);
    if (!targets.length) return;
    if (event.type === 'activate') {
      if (targets.includes(document.activeElement))
        document.activeElement.click();
      else targets[0].focus();
      return;
    }
    if (event.type === 'move') {
      const i = targets.indexOf(document.activeElement),
        delta = ['left', 'up'].includes(event.direction) ? -1 : 1;
      targets[(i + delta + targets.length) % targets.length].focus();
    }
  }
  function bindInput(id, gameplay = false) {
    input?.dispose();
    input = null;
    if (!inputProviderFactory) return;
    try {
      input = inputProviderFactory({ titleId: id });
      if (gameplay) {
        input.mount({
          touchRoot: $('#touch-controls'),
          controlsRoot: $('#control-settings'),
        });
        let menuHeld = false;
        input.subscribe((snapshot) => {
          const pressed = (snapshot.buttons.menu ?? 0) > 0.5;
          if (pressed && !menuHeld && active?.channel?.state === 'playable') {
            menuHeld = true;
            pause();
            return;
          }
          menuHeld = pressed;
          active?.channel?.sendInput(snapshot);
        });
      }
      input.subscribeNavigation(nav);
      input.start();
    } catch {
      input?.dispose();
      input = null;
      if (gameplay) {
        $('#runtime-note').textContent =
          'Input is unavailable. Return to the game page and try again.';
        failRuntime('unsupported');
      }
    }
  }
  function navigate(path) {
    if (disposed) return;
    history.pushState({}, '', path);
    renderRoute();
    main.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const onClick = (e) => {
    const a = e.target.closest('a');
    if (
      a &&
      a.origin === location.origin &&
      a.pathname.startsWith('/') &&
      !a.target &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      e.button === 0
    ) {
      e.preventDefault();
      navigate(a.pathname);
    }
  };
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', renderRoute);
  const openAbout = () => {
      if (active) pause();
      $('#about-dialog').showModal();
    },
    closeAbout = () => $('#about-dialog').close();
  $('#about-button').addEventListener('click', openAbout);
  $('#close-about').addEventListener('click', closeAbout);
  async function refresh() {
    const version = ++loadVersion;
    const data = validateCatalog(await loadCatalog(), {
      mode,
      shellOrigin: location.origin,
    });
    if (disposed || version !== loadVersion) return null;
    catalog = data;
    return data;
  }
  function status(title, description, { retry = false, back = true } = {}) {
    main.replaceChildren();
    const wrap = node('div', 'wrap'),
      section = node('section', 'status-card');
    section.setAttribute('aria-live', 'polite');
    section.append(
      node('p', 'eyebrow', 'A LITTLE PAUSE'),
      node('h1', '', title),
      node('p', '', description),
    );
    const actions = node('div', 'status-actions');
    if (retry) {
      const b = node('button', 'primary', 'Try again ↗');
      b.onclick = initialize;
      actions.append(b);
    }
    if (back) {
      const a = node('a', 'secondary', 'Back to discover');
      a.href = '/';
      actions.append(a);
    }
    section.append(actions);
    wrap.append(section);
    main.append(wrap);
  }
  async function initialize() {
    clearSession();
    try {
      const data = await refresh();
      if (data) renderRoute();
    } catch {
      status(
        'Couldn’t open the library.',
        'The catalog is temporarily unavailable. Your next game can wait a moment.',
        { retry: true },
      );
      bindInput('catalog');
    }
  }
  function renderRoute() {
    if (disposed) return;
    clearSession();
    if (!catalog) return;
    const route = routeFor(location.pathname);
    if (route.view === 'catalog') renderCatalog();
    else if (route.view === 'detail') {
      const entry = catalog.entries.find((e) => e.manifest.id === route.id);
      if (entry) renderDetail(entry);
      else
        status(
          'This game isn’t available.',
          'The link may be old, or the game may no longer be published. Explore the library for something else.',
        );
    } else
      status(
        'A little off the map.',
        'There isn’t a page at this address. Let’s take you back to discover.',
      );
    bindInput('catalog');
  }
  function renderCatalog() {
    document.title = 'Akeru — Good games. Wide open.';
    telemetry({ type: 'catalogView' });
    main.innerHTML =
      '<div class="wrap"><section class="hero" aria-labelledby="hero-title"><div><p class="eyebrow">A LITTLE LESS WAIT. A LITTLE MORE PLAY.</p><h1 id="hero-title">Good games.<br>Wide open.</h1><p class="intro">Pick something good. Play in your browser. A controller or a fingertip is all you need.</p><div class="pill-row"><span class="pill">Free guest play</span><span class="pill">Controller + touch</span><span class="pill">No download</span></div></div><div class="hero-art" aria-hidden="true"><span class="art-corner">開ける / OPEN</span><span class="portal"><svg class="portal-brand-mark" viewBox="0 0 111 104" aria-hidden="true"><use href="#backbone-mark"/></svg></span><span class="orbit-dot"></span><span class="art-label">MAKE ROOM FOR PLAY ↗</span></div></section><section aria-labelledby="library-title"><div class="section-head"><h2 id="library-title">Find your next.</h2><span id="game-count" class="count" aria-live="polite"></span></div><div class="filters" id="filters" role="group" aria-label="Filter games"></div><div id="game-grid"></div></section><section class="values" aria-label="The Akeru way"><article><p class="value-number">01 /</p><h3>Just press play.</h3><p>No membership. No account required. A little window for a little escape.</p></article><article><p class="value-number">02 /</p><h3>Play your way.</h3><p>Every published game supports controller and touch. Settle in however you like.</p></article><article><p class="value-number">03 /</p><h3>Know what you play.</h3><p>Source, credits, controls and privacy details live on every game page.</p></article></section></div>';
    for (const category of ['all', ...CATEGORIES]) {
      const b = node(
        'button',
        'filter',
        category === 'all' ? 'All games' : cap(category),
      );
      b.setAttribute('aria-pressed', String(filters.category === category));
      b.onclick = () => {
        filters.category = category;
        renderCatalog();
        $('#filters button').focus();
      };
      $('#filters').append(b);
    }
    const controller = node(
      'button',
      'filter controller-filter',
      '⌘ Controller ready',
    );
    controller.setAttribute('aria-pressed', String(filters.controller));
    controller.onclick = () => {
      filters.controller = !filters.controller;
      controller.setAttribute('aria-pressed', String(filters.controller));
      renderCards();
    };
    $('#filters').append(controller);
    const search = node('input', 'search');
    search.type = 'search';
    search.placeholder = 'Find a game';
    search.setAttribute('aria-label', 'Search games');
    search.maxLength = 120;
    search.value = filters.query;
    search.oninput = () => {
      filters.query = search.value;
      renderCards();
    };
    $('#filters').append(search);
    renderCards();
  }
  function renderCards() {
    const entries = filterEntries(catalog.entries, filters);
    $('#game-count').textContent =
      `${entries.length} ${entries.length === 1 ? 'game' : 'games'}`;
    const target = $('#game-grid');
    target.replaceChildren();
    if (!entries.length) {
      const section = node('div', 'empty-library');
      section.append(node('span', 'empty-icon', '↗'));
      const copy = node('div');
      copy.append(
        node(
          'h3',
          '',
          catalog.entries.length
            ? 'Nothing here just yet.'
            : 'Something good takes a little care.',
        ),
        node(
          'p',
          '',
          catalog.entries.length
            ? 'Try another category or a different search. Your next game might be one click away.'
            : 'The library is being prepared. Games will appear here once they have passed review and are ready to play. No titles are published yet.',
        ),
      );
      section.append(copy);
      target.append(section);
      return;
    }
    const grid = node('div', 'grid');
    for (const e of entries) {
      const a = node('a', 'game-card');
      a.href = `/g/${e.manifest.id}`;
      const art = node('div', `card-art ${e.metadata.category}`);
      art.setAttribute('aria-hidden', 'true');
      art.append(
        node(
          'span',
          'card-tag',
          mode === 'demo' ? 'ORIGINAL TEST FIXTURE' : cap(e.metadata.category),
        ),
      );
      const copy = node('div', 'card-copy');
      copy.append(
        node('h3', '', e.manifest.title),
        node('p', '', e.metadata.summary),
      );
      const bottom = node('div', 'card-bottom');
      bottom.append(
        node(
          'span',
          '',
          e.availability === 'paused'
            ? 'Temporarily unavailable'
            : 'Controller + touch',
        ),
        node('span', 'arrow-button', '↗'),
      );
      copy.append(bottom);
      a.append(art, copy);
      grid.append(a);
    }
    target.append(grid);
  }
  function renderDetail(entry) {
    const m = entry.manifest,
      meta = entry.metadata;
    document.title = `${m.title} — Akeru`;
    telemetry({ type: 'detailView', titleId: m.id });
    main.innerHTML =
      '<div class="wrap"><a class="back" href="/">← All games</a><section class="detail-top"><div id="detail-art" class="card-art detail-art" aria-hidden="true"></div><div class="detail-copy"><p id="category" class="eyebrow"></p><h1 id="title"></h1><p id="description" class="description"></p><div class="pill-row"><span class="pill">Free guest play</span><span class="pill">Controller + touch</span></div><button id="play-button" class="primary">Play now <span aria-hidden="true">↗</span></button><p id="play-note" class="fine">No account or membership needed.</p></div></section><dl class="facts" id="facts"></dl><section class="detail-info"><div><div class="info-block"><h2>Make yourself comfortable.</h2><h3>Controller</h3><div id="controller-help"></div><h3>Touch</h3><div id="touch-help"></div></div><div class="info-block"><h2>Your progress.</h2><p id="save-info"></p></div></div><div><div class="info-block"><h2>A few things to know.</h2><div id="privacy-info"></div></div><div class="info-block"><h2>Open by design.</h2><p id="source-license"></p><div id="source-links" class="source-links"></div><p class="fine">Source revision</p><p id="source-revision" class="revision"></p></div></div></section></div>';
    $('#detail-art').classList.add(meta.category);
    $('#category').textContent = `${cap(meta.category)} / ${meta.creator}`;
    $('#title').textContent = m.title;
    $('#description').textContent = meta.description;
    for (const [label, value] of [
      ['Created by', meta.creator],
      ['Content', meta.ageLabel],
      ['Version', m.version],
      ['Access', 'Free · no membership'],
    ]) {
      const item = node('div');
      item.append(node('dt', '', label), node('dd', '', value));
      $('#facts').append(item);
    }
    $('#controller-help').append(list(meta.controls.controller));
    $('#touch-help').append(list(meta.controls.touch));
    $('#privacy-info').append(list(meta.privacy));
    $('#save-info').textContent =
      mode === 'demo'
        ? 'This test fixture does not save progress. Account linking and cloud sync are not connected.'
        : 'Guest local saves are required by the package. This preview has no connected save service; account linking and cloud sync are unavailable.';
    $('#source-license').textContent =
      `Source license: ${m.provenance.source.license}`;
    $('#source-revision').textContent = m.provenance.source.revision;
    $('#source-links').append(link('View source ↗', m.provenance.source.url));
    for (const n of meta.notices)
      $('#source-links').append(link(n.label, n.url));
    const play = $('#play-button');
    if (entry.availability === 'paused') {
      play.disabled = true;
      play.textContent = 'Temporarily unavailable';
      $('#play-note').textContent =
        'This game is taking a break. Please check back later.';
    } else play.onclick = () => launch(entry);
  }
  async function launch(original) {
    const currentPath = location.pathname;
    const play = $('#play-button');
    if (play) {
      play.disabled = true;
      play.textContent = 'Opening…';
    }
    telemetry({ type: 'launchRequested', titleId: original.manifest.id });
    try {
      const data = await refresh();
      if (!data || location.pathname !== currentPath) return;
      const entry = data.entries.find(
        (e) => e.manifest.id === original.manifest.id,
      );
      if (!entry) {
        renderRoute();
        return;
      }
      if (entry.availability !== 'available') {
        renderDetail(entry);
        return;
      }
      if (mode === 'production') {
        status(
          'Play is not connected yet.',
          'This preview does not have the live publication and save services needed to start a released game.',
        );
        return;
      }
      renderRuntime(entry);
    } catch {
      if (location.pathname === currentPath)
        status(
          'Couldn’t start this game.',
          'We couldn’t confirm the latest game availability. Please try again.',
          { retry: true },
        );
    }
  }
  function renderRuntime(entry) {
    clearSession();
    main.innerHTML =
      '<div class="runtime-wrap"><div class="runtime-bar"><div class="runtime-brand"><svg class="brand-mark" viewBox="0 0 111 104" aria-hidden="true"><use href="#backbone-mark"/></svg><h1 id="runtime-title"></h1></div><div class="runtime-tools"><button id="runtime-controls" class="secondary">Controls</button><button id="runtime-pause" class="secondary">Pause</button><button id="runtime-exit" class="secondary">Exit</button></div></div><div class="runtime-stage" id="runtime-stage"><div id="runtime-overlay" class="runtime-overlay" role="status"><span class="spinner" aria-hidden="true"></span><h2>Finding your orbit…</h2><p>Opening the isolated test fixture.</p></div></div><div class="controls-row"><p class="runtime-note" id="runtime-note">Original test fixture · no progress is saved · no account connection</p></div><div id="touch-controls"></div><div id="control-settings"></div></div>';
    $('#runtime-title').textContent = entry.manifest.title;
    const frame = node('iframe');
    frame.title = `${entry.manifest.title} isolated runtime`;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('allow', 'gamepad');
    const nonce = crypto.randomUUID(),
      start = performance.now();
    frame.src = `${titleUrl(entry)}#${new URLSearchParams({ nonce, shell: location.origin })}`;
    $('#runtime-stage').prepend(frame);
    active = { entry, frame, channel: null };
    const session = active;
    active.channel = createRuntimeChannel({
      frame: frame.contentWindow,
      origin: entry.release.origin,
      nonce,
      onEvent: (event) => {
        if (active !== session) return;
        if (event.type === 'playable') {
          $('#runtime-overlay').hidden = true;
          telemetry({
            type: 'playable',
            titleId: entry.manifest.id,
            durationMs: Math.min(600000, performance.now() - start),
          });
          bindInput(entry.manifest.id, true);
        } else if (event.type === 'error') failRuntime(event.code);
        else if (event.type === 'exit') navigate(`/g/${entry.manifest.id}`);
      },
    });
    frame.addEventListener('load', () => {
      if (active === session) active.channel.connect();
    });
    $('#runtime-exit').onclick = () => navigate(`/g/${entry.manifest.id}`);
    $('#runtime-pause').onclick = () =>
      active?.channel.state === 'paused' ? resume() : pause();
    $('#runtime-controls').onclick = () => {
      pause();
      input?.showControls();
      input?.refreshControllers?.();
      stopControlsMonitor();
      controlsTimer = setInterval(() => input?.refreshControllers?.(), 250);
    };
    main.focus();
  }
  function pause() {
    if (active?.channel.state !== 'playable') return;
    input?.stop();
    active.channel.pause();
    if (inputProviderFactory) {
      navInput?.dispose();
      navInput = inputProviderFactory({ titleId: 'catalog' });
      navInput.subscribeNavigation(nav);
      navInput.start();
    }
    $('#runtime-pause').textContent = 'Resume';
    const o = $('#runtime-overlay');
    o.replaceChildren(
      node('p', 'eyebrow', 'TAKE YOUR TIME'),
      node('h2', '', 'A little breather.'),
      node('p', '', 'Your session is paused. Come back when you’re ready.'),
    );
    const b = node('button', 'primary', 'Keep playing ↗');
    b.onclick = resume;
    o.append(b);
    o.hidden = false;
  }
  function resume() {
    if (!active?.channel.resume()) return;
    stopControlsMonitor();
    navInput?.dispose();
    navInput = null;
    input?.hideControls();
    input?.start();
    $('#runtime-overlay').hidden = true;
    $('#runtime-pause').textContent = 'Pause';
  }
  function failRuntime(code) {
    if (!active) return;
    stopControlsMonitor();
    navInput?.dispose();
    navInput = null;
    input?.dispose();
    input = null;
    active.channel.dispose();
    active.frame.remove();
    telemetry({
      type: 'launchFailed',
      titleId: active.entry.manifest.id,
      code,
    });
    const e = active.entry,
      o = $('#runtime-overlay');
    o.replaceChildren(
      node('p', 'eyebrow', 'LET’S TRY THAT AGAIN'),
      node('h2', '', 'The game couldn’t open.'),
      node('p', '', 'The runtime did not become ready, or ended unexpectedly.'),
    );
    const b = node('button', 'primary', 'Try again ↗');
    b.onclick = () => {
      navigate(`/g/${e.manifest.id}`);
      launch(e);
    };
    o.append(b);
    o.hidden = false;
    $('#runtime-pause').disabled = true;
    $('#runtime-controls').disabled = true;
    if (inputProviderFactory) {
      navInput = inputProviderFactory({ titleId: 'catalog' });
      navInput.subscribeNavigation(nav);
      navInput.start();
    }
  }
  initialize();
  return Object.freeze({
    navigate,
    refresh: initialize,
    dispose() {
      disposed = true;
      loadVersion++;
      clearSession();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', renderRoute);
      document.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibility);
      $('#about-button').removeEventListener('click', openAbout);
      $('#close-about').removeEventListener('click', closeAbout);
    },
  });
}
