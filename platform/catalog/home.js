import { CATEGORIES, filterEntries } from './model.js';
import {
  icon,
  cover,
  consoleHeader,
  consoleFooter,
  bindConsoleChrome,
  cascadeIn,
  openConsoleKeyboard,
  syncTabPill,
  EASE,
} from './console-ui.js';
import { createGameSheet } from './game-sheet.js';
import { promotionUrl } from './promotions.js';
const KEY = 'akeru.recent.v1';
const LIBRARY_KEY = 'akeru.library.v1';
const LIBRARY_LIMIT = 200;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function readRows(storage, key, limit) {
  try {
    const rows = JSON.parse(storage?.getItem(key) ?? '[]');
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows
      .filter((row) => {
        if (
          !row ||
          typeof row.id !== 'string' ||
          row.id.length > 64 ||
          !idPattern.test(row.id) ||
          !Number.isSafeInteger(row.at) ||
          row.at < 0 ||
          seen.has(row.id)
        )
          return false;
        seen.add(row.id);
        return true;
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ id, at }) => ({ id, at }));
  } catch {
    return [];
  }
}
export function readRecent(storage) {
  return readRows(storage, KEY, 24);
}
export function recordPlayed(storage, id, at = Date.now()) {
  if (
    !idPattern.test(id) ||
    id.length > 64 ||
    !Number.isSafeInteger(at) ||
    at < 0
  )
    return;
  try {
    storage?.setItem(
      KEY,
      JSON.stringify(
        [
          { id, at },
          ...readRecent(storage).filter((row) => row.id !== id),
        ].slice(0, 24),
      ),
    );
  } catch {
    /* History is optional; play is not. */
  }
}
/** Saved games are a shell-owned list of title ids. Games never see it. */
export function readLibrary(storage) {
  return readRows(storage, LIBRARY_KEY, LIBRARY_LIMIT);
}
export function libraryAfter(rows, id, saved, at = Date.now()) {
  if (
    typeof id !== 'string' ||
    id.length > 64 ||
    !idPattern.test(id) ||
    !Number.isSafeInteger(at) ||
    at < 0
  )
    return rows.slice();
  const rest = rows.filter((row) => row.id !== id);
  return saved ? [{ id, at }, ...rest].slice(0, LIBRARY_LIMIT) : rest;
}
export function setLibraryEntry(storage, id, saved, at = Date.now()) {
  const next = libraryAfter(readLibrary(storage), id, saved, at);
  try {
    storage?.setItem(LIBRARY_KEY, JSON.stringify(next));
  } catch {
    /* The library is optional; play is not. */
  }
  return next;
}
function createLibrary(storage) {
  let rows = readLibrary(storage);
  return {
    has: (id) => rows.some((row) => row.id === id),
    rows: () => rows.slice(),
    toggle(id) {
      const saved = !rows.some((row) => row.id === id);
      rows = libraryAfter(rows, id, saved);
      try {
        storage?.setItem(LIBRARY_KEY, JSON.stringify(rows));
      } catch {
        /* Keep the session copy when storage is unavailable. */
      }
      return saved;
    },
  };
}
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];
export function lastPlayedLabel(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'Played just now';
  const [unit, size] = UNITS.find(([, span]) => seconds >= span);
  return `Last played ${new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.floor(seconds / size), unit)}`;
}
// The console uses native controls; title launches still go through the host.
const el = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;
const FEATURE_ORDER = [
  'open-golf',
  'old-san-juan-kart',
  'freedoom1',
  'hextris',
  'neverball',
  'supertux',
  'anarch',
  '2048',
  'server-survival',
  'isocity',
  'whatajong',
];
const ROW_ORDER = [
  'action',
  'racing',
  'puzzle',
  'sports',
  'strategy',
  'sandbox',
];
const ROWS = Object.freeze({
  action: ['Action', 'Fast hands, big moments'],
  racing: ['Racing', 'Pedal down, pick your line'],
  puzzle: ['Puzzle breaks', 'Five minutes or fifty'],
  sports: ['Sports', 'A little fresh air'],
  strategy: ['Strategy', 'Plan, build, outlast'],
  sandbox: ['Sandbox & sims', 'Build at your own pace'],
});
const SKELETON = (preview) => `
  <div class="console-shell console-hub" data-home-view="play">
    ${consoleHeader({ preview })}
    <div class="console-content">
      <section class="console-view console-home-view" data-panel="play" aria-labelledby="home-title">
        <div class="home-head"><div class="home-greeting"><h1 id="home-title"></h1><p id="home-subtitle"></p></div><div class="home-chips" role="group" aria-label="Jump to a section"></div></div>
        <div class="bento" id="home-bento"></div>
        <div class="home-rows" id="home-rows"></div>
        <div class="console-empty" hidden><span class="console-empty-mark">${icon('sparkle')}</span><h1>The library is being prepared.</h1><p>Games will appear after review. No titles are published yet.</p></div>
      </section>
      <section class="console-view console-discover-view" data-panel="discover" hidden aria-labelledby="discover-title">
        <div class="view-head"><div><p class="console-eyebrow">THE OPEN COLLECTION</p><h1 id="discover-title">Discover</h1><p class="view-sub">Every game in Akeru, free to play and open to explore.</p></div><span id="game-count" class="view-count" aria-live="polite"></span></div>
        <div class="discover-toolbar"><label class="discover-search">${icon('search')}<span class="visually-hidden">Search games</span></label><div class="filters" id="filters" role="group" aria-label="Filter games"></div><label class="discover-sort"><span>Sort</span></label></div>
        <div id="game-grid"></div>
      </section>
      <section class="console-view console-library-view" data-panel="library" hidden aria-labelledby="library-title">
        <div class="view-head"><div><p class="console-eyebrow">ON THIS DEVICE</p><h1 id="library-title">Your library</h1><p class="view-sub">Games you’ve saved, played or made progress in.</p></div><span id="library-count" class="view-count"></span></div>
        <section class="library-section" id="saved-section" hidden aria-labelledby="saved-title"><div class="section-head"><h2 id="saved-title">Saved games</h2><span></span></div><div class="library-grid" id="saved-grid"></div></section>
        <section class="library-section" id="recent-section" hidden aria-labelledby="recent-title"><div class="section-head"><h2 id="recent-title">Recently played</h2><span></span></div><div class="library-grid" id="recent-rail"></div></section>
        <section class="library-section" id="progress-section" hidden aria-labelledby="progress-title"><div class="section-head"><h2 id="progress-title">Progress on this device</h2><span></span></div><div class="library-grid" id="progress-grid"></div></section>
        <div class="library-empty" id="library-empty" hidden><span class="library-empty-mark">${icon('library')}</span><h2>Your library is ready for its first game.</h2><p>Open any game and choose Add to library, or just start playing. Games you play or save progress in show up here.</p><button type="button" class="library-empty-action" data-go-discover>${icon('search')}Discover games</button></div>
      </section>
    </div>
    ${consoleFooter()}
  </div>`;

export function renderGameHome(
  main,
  entries,
  {
    filters = { category: 'all', controller: false, query: '' },
    recent = [],
    onFilters = () => {},
    onLaunch,
    preview = false,
    sound,
    initialView = 'play',
    onView = () => {},
    storage = null,
    savesFor,
    onCloseGame,
  } = {},
) {
  main.innerHTML = SKELETON(preview);
  document.body.classList.add('console-home-active');
  const find = (selector) => main.querySelector(selector);
  const shell = find('.console-hub');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const library = createLibrary(storage);
  const byId = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  const available = entries.filter((e) => e.availability !== 'paused');
  const rank = (entry) => {
    const index = FEATURE_ORDER.indexOf(entry.manifest.id);
    return index < 0 ? FEATURE_ORDER.length : index;
  };
  const ranked = available.slice().sort((a, b) => rank(a) - rank(b));
  const recentRows = recent.filter((row) => byId.has(row.id));
  const recentEntries = recentRows.map((row) => byId.get(row.id));
  const recentAt = new Map(recentRows.map((row) => [row.id, row.at]));
  const feature = ranked[0];
  let view = 'play';
  let launching = false;
  let disposed = false;
  let progressIds = null;

  function gameCard(entry, variant = 'row') {
    const link = el('a', `game-card game-card-${variant}`);
    link.href = `/g/${entry.manifest.id}`;
    link.dataset.game = entry.manifest.id;
    const copy = el('span', 'game-card-copy');
    copy.append(
      el('span', 'console-game-name', entry.manifest.title),
      el('span', 'game-card-meta', cap(entry.metadata.category)),
    );
    link.append(cover(entry, { label: false, lazy: true }), copy);
    const badge = el('span', 'game-card-saved');
    badge.innerHTML = `${icon('check')}<span class="visually-hidden">In your library</span>`;
    link.append(badge);
    if (library.has(entry.manifest.id)) link.dataset.saved = '';
    if (entry.availability === 'paused')
      link.append(el('span', 'console-unavailable', 'Temporarily unavailable'));
    return link;
  }
  function syncSaved(id, saved) {
    for (const card of main.querySelectorAll(`[data-game="${id}"]`))
      card.toggleAttribute('data-saved', saved);
    renderSavedRow();
    if (view === 'library') renderLibrary();
  }
  const viewTitle = () =>
    `${view === 'play' ? 'Home' : view === 'library' ? 'Library' : 'Discover'} — Akeru`;
  const sheet = createGameSheet(shell, {
    onPlay: (entry) => launchEntry(entry, true),
    onClose: (entry) => {
      document.title = viewTitle();
      onCloseGame?.(entry);
    },
    savesFor,
    lastPlayed: (id) =>
      recentAt.has(id) ? lastPlayedLabel(recentAt.get(id)) : null,
    // Deep links have no card to return to: land on the game if it is on
    // screen, otherwise on the view's primary target.
    restoreFocus: (entry) => {
      const inView = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
      };
      const panel = panelFor(view);
      const target =
        [...panel.querySelectorAll('a[data-game]')].find(
          (card) => card.dataset.game === entry?.manifest.id && inView(card),
        ) ??
        (view === 'play'
          ? featureLink()
          : panel.querySelector('[data-console-primary]'));
      target?.focus({ preventScroll: true });
    },
    library: {
      has: (id) => library.has(id),
      toggle: (id) => {
        const saved = library.toggle(id);
        syncSaved(id, saved);
        return saved;
      },
    },
  });
  const featureLink = () => find('.bento-feature .bento-link');
  function launchEntry(entry, fromSheet = false) {
    if (!entry || launching || !onLaunch) return;
    launching = true;
    const button = find('#featured-launch');
    if (!fromSheet && button?.dataset.launch === entry.manifest.id) {
      button.disabled = true;
      button.querySelector('span').textContent = 'Opening…';
    }
    onLaunch(entry);
  }

  function renderHead() {
    find('#home-title').textContent = `${greetingFor()}. What are we playing?`;
    find('#home-subtitle').textContent = available.length
      ? `${plural(available.length, 'game')}. Ready when you are.`
      : 'New games are on the way.';
  }
  function renderBento() {
    const bento = find('#home-bento');
    if (!feature) {
      bento.hidden = true;
      find('.home-chips').hidden = true;
      find('.console-empty').hidden = false;
      find('[data-shortcut="play"]').disabled = true;
      find('[data-shortcut="details"]').disabled = true;
      return;
    }
    const used = new Set([feature]);
    const continues = [];
    for (const entry of recentEntries)
      if (
        continues.length < 2 &&
        entry.availability !== 'paused' &&
        !used.has(entry)
      ) {
        continues.push([entry, true]);
        used.add(entry);
      }
    for (const entry of ranked) {
      if (continues.length >= 2) break;
      if (!used.has(entry)) {
        continues.push([entry, false]);
        used.add(entry);
      }
    }
    const spot = ranked.find((entry) => !used.has(entry));
    if (spot) used.add(spot);
    const minis = ranked.filter((entry) => !used.has(entry)).slice(0, 2);
    for (const entry of minis) used.add(entry);
    const rest = entries.filter((entry) => !used.has(entry));

    const tile = el('article', 'bento-tile bento-feature');
    tile.dataset.area = 'f';
    const link = el('a', 'bento-link');
    link.href = `/g/${feature.manifest.id}`;
    link.dataset.game = feature.manifest.id;
    link.dataset.consolePrimary = '';
    link.setAttribute(
      'aria-label',
      `${feature.manifest.title}, featured ${feature.metadata.category} game`,
    );
    link.append(cover(feature, { label: false }));
    const copy = el('div', 'bento-copy');
    const play = el('button', 'bento-play');
    play.type = 'button';
    play.id = 'featured-launch';
    play.dataset.launch = feature.manifest.id;
    play.dataset.navSkip = '';
    play.innerHTML =
      '<kbd class="glyph-a" aria-hidden="true">A</kbd><span>Play now</span>';
    play.onclick = () => launchEntry(feature);
    copy.append(
      el(
        'p',
        'bento-kicker',
        `FEATURED · ${feature.metadata.category.toUpperCase()}`,
      ),
      el('h2', '', feature.manifest.title),
      el('p', 'bento-summary', feature.metadata.summary),
      play,
    );
    tile.append(link, copy);
    const tiles = [tile];

    continues.forEach(([entry, played], index) => {
      const card = el('a', 'bento-tile bento-game');
      card.dataset.area = `c${index + 1}`;
      card.href = `/g/${entry.manifest.id}`;
      card.dataset.game = entry.manifest.id;
      const label = el('span', 'bento-label');
      label.append(
        el('strong', '', entry.manifest.title),
        el(
          'span',
          '',
          played
            ? lastPlayedLabel(recentAt.get(entry.manifest.id))
            : entry.metadata.summary,
        ),
      );
      card.append(
        cover(entry, { label: false }),
        el(
          'span',
          `bento-pill${played ? ' is-continue' : ''}`,
          played ? 'CONTINUE' : entry.metadata.category.toUpperCase(),
        ),
        label,
      );
      tiles.push(card);
    });
    if (spot) {
      const card = el('a', 'bento-tile bento-game bento-spot');
      card.dataset.area = 's';
      card.href = `/g/${spot.manifest.id}`;
      card.dataset.game = spot.manifest.id;
      const label = el('span', 'bento-label');
      label.append(
        el('strong', '', spot.manifest.title),
        el('span', '', cap(spot.metadata.category)),
      );
      card.append(
        cover(spot, { label: false }),
        el('span', 'bento-pill', 'TRY THIS'),
        label,
      );
      tiles.push(card);
    }
    if (minis.length) {
      const stack = el('div', 'bento-stack');
      stack.dataset.area = 'm';
      for (const entry of minis) {
        const card = el('a', 'bento-tile bento-mini');
        card.href = `/g/${entry.manifest.id}`;
        card.dataset.game = entry.manifest.id;
        card.append(
          cover(entry, { label: false }),
          el('span', 'bento-mini-name', entry.manifest.title),
        );
        stack.append(card);
      }
      tiles.push(stack);
    }
    const promo = el('article', 'bento-tile bento-promo');
    promo.dataset.area = 'p';
    promo.setAttribute('aria-labelledby', 'bento-promo-title');
    promo.innerHTML = `<div class="promo-art"><img src="/backbone-pro.png" alt="Backbone controller" decoding="async"></div><div class="promo-copy"><p class="bento-kicker">BACKBONE</p><h2 id="bento-promo-title">More ways to play</h2><p>Explore the Backbone app or find your controller. Playing here stays free.</p><div class="promo-actions"><a data-promo="app" target="_blank" rel="noopener noreferrer">${icon('phone')}<span>Get the app</span></a><a data-promo="controller" target="_blank" rel="noopener noreferrer">${icon('controller')}<span>Shop controllers</span></a></div></div>`;
    for (const anchor of promo.querySelectorAll('[data-promo]'))
      anchor.href = promotionUrl(anchor.dataset.promo);
    tiles.push(promo);
    const browse = el('button', 'bento-tile bento-browse');
    browse.type = 'button';
    browse.dataset.area = 'b';
    browse.setAttribute(
      'aria-label',
      `Browse all ${plural(entries.length, 'game')}`,
    );
    const thumbs = el('span', 'browse-thumbs');
    for (const entry of (rest.length ? rest : entries).slice(0, 4))
      thumbs.append(cover(entry, { label: false }));
    const count = el(
      'strong',
      'browse-count',
      rest.length ? `+${rest.length}` : String(entries.length),
    );
    browse.append(
      thumbs,
      count,
      el('span', 'browse-label', 'Browse all games'),
    );
    browse.onclick = () => browseAll();
    tiles.push(browse);

    const columns = [];
    if (continues.length === 2) columns.push(['c1', 'c2']);
    else if (continues.length === 1) columns.push(['c1', 'c1']);
    if (spot && minis.length) columns.push(['s', 'm']);
    else if (spot) columns.push(['s', 's']);
    else if (minis.length) columns.push(['m', 'm']);
    columns.push(['p', 'b']);
    bento.style.setProperty(
      '--bento-areas',
      `"f ${columns.map((c) => c[0]).join(' ')}" "f ${columns.map((c) => c[1]).join(' ')}"`,
    );
    bento.style.setProperty(
      '--bento-columns',
      `minmax(0, 1.55fr) ${columns.map(() => 'minmax(0, 1fr)').join(' ')}`,
    );
    bento.dataset.columns = String(columns.length + 1);
    bento.replaceChildren(...tiles);
  }

  function renderChips() {
    const chips = find('.home-chips');
    const options = [['top', 'For you']];
    if (recentEntries.length) options.push(['row-recent', 'Recently played']);
    for (const category of ROW_ORDER)
      if (available.some((e) => e.metadata.category === category))
        options.push([`row-${category}`, cap(category)]);
    for (const [target, label] of options.slice(0, 5)) {
      const chip = el('button', 'home-chip', label);
      chip.type = 'button';
      chip.dataset.jump = target;
      chip.onclick = () => jumpTo(target);
      chips.append(chip);
    }
    setActiveChip('top');
  }
  function setActiveChip(target) {
    for (const chip of main.querySelectorAll('.home-chip')) {
      const active = chip.dataset.jump === target;
      chip.toggleAttribute('data-active', active);
      if (active) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    }
  }
  function jumpTo(target) {
    if (target === 'top') {
      scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
      setActiveChip('top');
      return;
    }
    const section = find(`#${target}`);
    if (!section) return;
    section.scrollIntoView({
      block: 'start',
      behavior: reduced() ? 'instant' : 'smooth',
    });
    section.querySelector('[data-game]')?.focus({ preventScroll: true });
    setActiveChip(target);
  }
  function rowSection(id, title, subtitle, games, seeAll) {
    const section = el('section', 'home-row');
    section.id = id;
    section.setAttribute('aria-labelledby', `${id}-title`);
    const head = el('div', 'row-head');
    const heading = el('div', 'row-title');
    const h2 = el('h2', '', title);
    h2.id = `${id}-title`;
    heading.append(h2, el('span', 'row-sub', subtitle));
    head.append(heading);
    if (seeAll) {
      const more = el('button', 'row-more');
      more.type = 'button';
      more.innerHTML = `<span>See all ${games.length}</span>${icon('right')}`;
      more.setAttribute('aria-label', `See all ${games.length} ${title}`);
      more.onclick = seeAll;
      head.append(more);
    }
    const frame = el('div', 'row-frame');
    const track = el('div', 'row-track');
    track.dataset.navBlock = 'center';
    for (const entry of games) track.append(gameCard(entry, 'row'));
    const arrows = ['left', 'right'].map((side) => {
      const arrow = el('button', `row-arrow row-arrow-${side}`);
      arrow.type = 'button';
      arrow.tabIndex = -1;
      arrow.dataset.navSkip = '';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = icon(side);
      arrow.onclick = () =>
        track.scrollBy({
          left: (side === 'left' ? -1 : 1) * track.clientWidth * 0.8,
          behavior: reduced() ? 'instant' : 'smooth',
        });
      return arrow;
    });
    const syncArrows = () => {
      arrows[0].disabled = track.scrollLeft < 8;
      arrows[1].disabled =
        track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    track.addEventListener('scroll', syncArrows, { passive: true });
    requestAnimationFrame(syncArrows);
    frame.append(arrows[0], track, arrows[1]);
    section.append(head, frame);
    return section;
  }
  function renderSavedRow() {
    const rows = find('#home-rows');
    find('#row-saved')?.remove();
    const saved = library
      .rows()
      .map((row) => byId.get(row.id))
      .filter((entry) => entry && entry.availability !== 'paused');
    if (!saved.length || !feature) return;
    const section = rowSection(
      'row-saved',
      'Your library',
      'Saved on this device',
      saved,
    );
    const after = find('#row-recent');
    if (after) after.after(section);
    else rows.prepend(section);
    observeRow(section);
  }
  let rowObserver = null;
  function observeRow(section) {
    if (reduced() || typeof IntersectionObserver !== 'function') return;
    rowObserver ??= new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          rowObserver.unobserve(record.target);
          cascadeIn(record.target.querySelectorAll('.game-card'), {
            x: 26,
            y: 0,
            step: 38,
            max: 7,
          });
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    rowObserver.observe(section);
  }
  function renderRows() {
    const rows = find('#home-rows');
    if (!feature) return;
    const playable = recentEntries.filter((e) => e.availability !== 'paused');
    if (playable.length)
      rows.append(
        rowSection('row-recent', 'Jump back in', 'Recently played', playable),
      );
    for (const category of ROW_ORDER) {
      const games = available.filter((e) => e.metadata.category === category);
      if (!games.length) continue;
      const [title, subtitle] = ROWS[category];
      rows.append(
        rowSection(`row-${category}`, title, subtitle, games, () => {
          filters.category = category;
          filters.query = '';
          search.value = '';
          update();
          showView('discover', true);
        }),
      );
    }
    renderSavedRow();
    for (const section of rows.querySelectorAll('.home-row'))
      observeRow(section);
  }

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search games';
  search.maxLength = 120;
  search.setAttribute('aria-label', 'Search games');
  search.value = filters.query ?? '';
  find('.discover-search').append(search);
  const categoryButtons = [];
  for (const category of ['all', ...CATEGORIES]) {
    const count =
      category === 'all'
        ? entries.length
        : entries.filter((e) => e.metadata.category === category).length;
    if (category !== 'all' && !count) continue;
    const button = el('button', 'filter');
    button.type = 'button';
    button.append(
      el('span', '', category === 'all' ? 'All games' : cap(category)),
      el('span', 'filter-count', String(count)),
    );
    button.onclick = () => {
      filters.category = category;
      update();
    };
    find('#filters').append(button);
    categoryButtons.push([button, category]);
  }
  const sort = el('select', 'console-sort');
  sort.setAttribute('aria-label', 'Sort games');
  for (const [value, label] of [
    ['default', 'Featured'],
    ['title', 'Title A–Z'],
    ['recent', 'Last played'],
    ['category', 'Category'],
  ]) {
    const option = el('option', '', label);
    option.value = value;
    sort.append(option);
  }
  sort.value = filters.sort ?? 'default';
  sort.onchange = () => {
    filters.sort = sort.value;
    update();
  };
  find('.discover-sort').append(sort);
  search.oninput = () => {
    filters.query = search.value;
    update();
  };
  search.onclick = () => {
    if (document.body.dataset.input === 'controller')
      openConsoleKeyboard(search);
  };
  function update() {
    onFilters(filters);
    if (
      filters.category !== 'all' &&
      !categoryButtons.some(([, category]) => category === filters.category)
    )
      filters.category = 'all';
    for (const [button, category] of categoryButtons)
      button.setAttribute(
        'aria-pressed',
        String(filters.category === category),
      );
    const results = filterEntries(entries, filters).slice();
    if (filters.sort === 'title')
      results.sort((a, b) => a.manifest.title.localeCompare(b.manifest.title));
    else if (filters.sort === 'recent')
      results.sort(
        (a, b) =>
          (recentAt.get(b.manifest.id) ?? 0) -
          (recentAt.get(a.manifest.id) ?? 0),
      );
    else if (filters.sort === 'category')
      results.sort(
        (a, b) =>
          a.metadata.category.localeCompare(b.metadata.category) ||
          a.manifest.title.localeCompare(b.manifest.title),
      );
    else results.sort((a, b) => rank(a) - rank(b));
    find('#game-count').textContent = plural(results.length, 'game');
    const grid = find('#game-grid');
    grid.replaceChildren();
    if (!results.length) {
      const empty = el('div', 'empty-library');
      empty.append(
        el(
          'h2',
          '',
          entries.length
            ? 'Nothing here just yet.'
            : 'The library is being prepared.',
        ),
        el(
          'p',
          '',
          entries.length
            ? 'Try another category or search.'
            : 'Games will appear after review. No titles are published yet.',
        ),
      );
      grid.append(empty);
      return;
    }
    const tiles = el('div', 'console-library-grid');
    for (const entry of results) tiles.append(gameCard(entry, 'grid'));
    tiles.firstElementChild.dataset.consolePrimary = '';
    grid.append(tiles);
    if (view === 'discover')
      cascadeIn(tiles.children, { y: 12, step: 18, max: 12 });
  }
  function fillGrid(grid, section, games) {
    const target = find(grid);
    target.replaceChildren(...games.map((entry) => gameCard(entry, 'grid')));
    find(section).hidden = !games.length;
    find(section).querySelector('.section-head > span').textContent =
      games.length ? plural(games.length, 'game') : '';
  }
  async function loadProgress() {
    if (progressIds || !savesFor) {
      progressIds ??= new Set();
      return;
    }
    progressIds = new Set();
    const found = new Set();
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const status = await savesFor(entry)?.status();
          if (status?.local === 'available' && status.quota.usedSlots > 0)
            found.add(entry.manifest.id);
        } catch {
          /* A title with unreadable saves is simply not listed. */
        }
      }),
    );
    if (disposed) return;
    progressIds = found;
    if (view === 'library') renderLibrary();
  }
  function renderLibrary() {
    const saved = library
      .rows()
      .map((row) => byId.get(row.id))
      .filter(Boolean);
    fillGrid('#saved-grid', '#saved-section', saved);
    fillGrid('#recent-rail', '#recent-section', recentEntries);
    const progress = entries.filter((e) => progressIds?.has(e.manifest.id));
    fillGrid('#progress-grid', '#progress-section', progress);
    const total = new Set([...saved, ...recentEntries, ...progress]).size;
    find('#library-count').textContent = total ? plural(total, 'game') : '';
    find('#library-empty').hidden = total > 0;
    const first = find('.console-library-view [data-game]');
    if (first) first.dataset.consolePrimary = '';
    if (!progressIds) void loadProgress();
  }
  function browseAll() {
    filters.query = '';
    filters.category = 'all';
    search.value = '';
    update();
    showView('discover', true);
  }
  const panelFor = (name) => find(`[data-panel="${name}"]`);
  function showView(next, focus = false) {
    if (!['play', 'discover', 'library'].includes(next)) next = 'play';
    const previous = view;
    view = next;
    shell.dataset.homeView = next;
    onView(next);
    for (const panel of main.querySelectorAll('[data-panel]'))
      panel.hidden = panel.dataset.panel !== next;
    if (!sheet.isOpen) document.title = viewTitle();
    for (const button of main.querySelectorAll('.console-tabs [data-view]')) {
      const active = button.dataset.view === next;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    syncTabPill(main, previous !== next);
    if (next === 'library') renderLibrary();
    if (previous !== next) {
      scrollTo({ top: 0, behavior: 'instant' });
      const order = ['play', 'discover', 'library'];
      const direction = order.indexOf(next) > order.indexOf(previous) ? 1 : -1;
      if (!reduced())
        panelFor(next).animate(
          [
            { opacity: 0, transform: `translateX(${direction * 36}px)` },
            { opacity: 1, transform: 'translateX(0)' },
          ],
          { duration: 340, easing: EASE },
        );
    }
    if (focus) {
      const target =
        next === 'play'
          ? featureLink()
          : (panelFor(next).querySelector('[data-console-primary]') ??
            panelFor(next).querySelector('button, a[href], input'));
      target?.focus({ preventScroll: true });
    }
  }
  const searchGames = (controller = false) => {
    showView('discover');
    search.focus({ preventScroll: true });
    if (controller === true || document.body.dataset.input === 'controller')
      openConsoleKeyboard(search);
  };

  renderHead();
  renderBento();
  renderChips();
  renderRows();
  for (const button of main.querySelectorAll('[data-search]'))
    button.onclick = searchGames;
  find('[data-shortcut="play"]').onclick = () => {
    const game = document.activeElement?.closest?.('[data-game]');
    launchEntry(game ? byId.get(game.dataset.game) : feature);
  };
  find('[data-shortcut="details"]').onclick = () => {
    const game = document.activeElement?.closest?.('[data-game]');
    (game ?? featureLink())?.click();
  };
  find('[data-shortcut="back"]').onclick = () => {
    if (view !== 'play') showView('play', true);
    else scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
  };
  find('[data-go-discover]').onclick = () => browseAll();

  let pendingOrigin = null;
  const onPointer = (event) => {
    pendingOrigin = event.target.closest?.('a[data-game]') ?? null;
  };
  main.addEventListener('click', onPointer, true);
  let chipFrame = 0;
  const onScroll = () => {
    if (chipFrame || view !== 'play') return;
    chipFrame = requestAnimationFrame(() => {
      chipFrame = 0;
      let active = 'top';
      for (const section of main.querySelectorAll('.home-row'))
        if (section.getBoundingClientRect().top < innerHeight * 0.45)
          active = section.id;
      setActiveChip(
        main.querySelector(`.home-chip[data-jump="${active}"]`)
          ? active
          : 'top',
      );
    });
  };
  addEventListener('scroll', onScroll, { passive: true });

  const onKey = (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest('input, select, textarea, dialog')
    )
      return;
    const key = event.key.toLowerCase();
    const game = event.target.closest('[data-game]');
    if (key === 'y' || event.key === '/') {
      event.preventDefault();
      searchGames();
    } else if (key === 'x') {
      const target = game ?? (view === 'play' ? featureLink() : null);
      if (target) {
        event.preventDefault();
        target.click();
      }
    } else if (key === 'a') {
      const entry = game
        ? byId.get(game.dataset.game)
        : view === 'play'
          ? feature
          : null;
      if (entry) {
        event.preventDefault();
        launchEntry(entry);
      }
    } else if (event.key === 'Escape' && view !== 'play') {
      event.preventDefault();
      showView('play', true);
    }
  };
  main.addEventListener('keydown', onKey);
  const disposeChrome = bindConsoleChrome(main, {
    onTab: (next) => showView(next),
    onSearch: searchGames,
    sound,
    profile: () => ({
      library: library.rows().filter((row) => byId.has(row.id)).length,
      played: recentEntries.length,
      games: entries.length,
    }),
  });
  const onNavigation = (event) => {
    const type = event.detail.type;
    const focused = document.activeElement;
    const game = main.contains(focused) ? focused.closest('[data-game]') : null;
    const tabs = ['play', 'discover', 'library'];
    if (type === 'activate' && game) launchEntry(byId.get(game.dataset.game));
    else if (type === 'nextTab' || type === 'previousTab') {
      showView(tabs[(tabs.indexOf(view) + (type === 'nextTab' ? 1 : 2)) % 3]);
      find(`.console-tabs [data-view="${view}"]`).focus({
        preventScroll: true,
      });
    } else if (type === 'search') searchGames(true);
    else if (type === 'details') {
      const target = game ?? (view === 'play' ? featureLink() : null);
      if (!target) return;
      target.click();
    } else if (type === 'back') {
      if (view !== 'play') showView('play', true);
      else if (scrollY > 40) {
        scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
        featureLink()?.focus({ preventScroll: true });
      }
    } else return;
    event.preventDefault();
  };
  main.addEventListener('console-navigation', onNavigation);
  update();
  showView(initialView);
  syncTabPill(main, false);
  if (!reduced() && view === 'play')
    cascadeIn(find('#home-bento').children, { y: 18, step: 55, max: 7 });

  return Object.freeze({
    openGame(entry) {
      const origin = pendingOrigin?.isConnected
        ? pendingOrigin
        : (document.activeElement?.closest?.('[data-game]') ?? null);
      pendingOrigin = null;
      launching = false;
      const button = find('#featured-launch');
      if (button?.disabled) {
        button.disabled = false;
        button.querySelector('span').textContent = 'Play now';
      }
      sheet.open(entry, origin);
    },
    closeGame() {
      sheet.close({ fromRoute: true });
      document.title = viewTitle();
    },
    get gameOpen() {
      return sheet.isOpen;
    },
    dispose() {
      disposed = true;
      sheet.dispose();
      rowObserver?.disconnect();
      cancelAnimationFrame(chipFrame);
      disposeChrome();
      removeEventListener('scroll', onScroll);
      main.removeEventListener('click', onPointer, true);
      main.removeEventListener('console-navigation', onNavigation);
      main.removeEventListener('keydown', onKey);
      document.body.classList.remove('console-home-active');
    },
  });
}
