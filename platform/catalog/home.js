import { CATEGORIES, filterEntries } from './model.js';
import {
  icon,
  cover,
  consoleHeader,
  bindConsoleChrome,
  setHeaderArt,
  animateIn,
  openConsoleKeyboard,
} from './console-ui.js';
const KEY = 'akeru.recent.v1';
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function readRecent(storage) {
  try {
    const rows = JSON.parse(storage?.getItem(KEY) ?? '[]');
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
      .slice(0, 24)
      .map(({ id, at }) => ({ id, at }));
  } catch {
    return [];
  }
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
// The console uses native controls; title launches still go through the host.
const el = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const preferred = [
  'old-san-juan-kart',
  'freedoom1',
  'open-golf',
  'hextris',
  'anarch',
  'server-survival',
];
function gameCard(entry, compact = false) {
  const link = el(
    'a',
    compact
      ? 'console-shelf-card recent-card'
      : 'game-card console-library-card',
  );
  link.href = `/g/${entry.manifest.id}`;
  link.append(
    cover(entry, { label: false }),
    el('span', 'console-game-name', entry.manifest.title),
  );
  if (entry.availability === 'paused')
    link.append(el('span', 'console-unavailable', 'Temporarily unavailable'));
  return link;
}

export function renderGameHome(
  main,
  entries,
  {
    filters,
    recent,
    onFilters,
    onLaunch,
    preview = false,
    sound,
    initialView = 'play',
    onView = () => {},
  },
) {
  main.innerHTML = `
    <div class="console-shell console-hub" data-home-view="play">
      <div class="console-backdrop" id="feature-scene" aria-hidden="true"></div>
      <div class="console-body">
        ${consoleHeader({ preview, brand: 'akeru' })}
        <div class="console-content">
          <section class="console-play-view" aria-label="Play home">
            <div class="console-stage">
              <div class="console-info"><p class="console-eyebrow">READY WHEN YOU ARE</p><div id="featured-copy" aria-live="polite"></div><div class="console-launch-actions"><button class="console-launch" id="featured-launch" data-console-primary>${icon('play')}<span>Play now</span></button><a class="console-details" id="featured-details">${icon('library')}Game details</a></div></div>
            </div>
            <section class="console-shelf console-picker" aria-labelledby="console-shelf-title"><div class="console-shelf-heading"><h2 id="console-shelf-title">Your next game</h2><button id="console-browse-all"></button></div><div id="console-shelf-cards" aria-label="Choose your next game"></div></section>
            <footer class="console-footer console-home-controls"><div class="console-shortcuts" aria-label="Controller and keyboard shortcuts"><button data-shortcut="play"><kbd>A</kbd>Play</button><button data-shortcut="details"><kbd>X</kbd>Details</button><button data-search><kbd>Y</kbd>Search</button></div><span class="console-play-note">${icon('controller')}Guest play · Controller, keyboard or touch</span></footer>
            <div class="console-collections"></div>
            <div class="console-empty" hidden><h1>The library is being prepared.</h1><p>Games will appear after review. No titles are published yet.</p></div>
          </section>
          <section class="console-library-view" hidden aria-labelledby="console-library-title"><div class="console-library-heading"><div><p class="console-eyebrow">THE OPEN COLLECTION</p><h1 id="console-library-title">Discover</h1></div><span id="game-count" aria-live="polite"></span></div><div class="filters" id="filters" role="group" aria-label="Filter games"></div><section id="recent-section" hidden><h2>Recently played</h2><div class="console-recent-grid" id="recent-rail"></div></section><div id="game-grid"></div></section>
        </div>
      </div>
    </div>`;
  document.body.classList.add('console-home-active');
  const find = (selector) => main.querySelector(selector);
  const available = entries.filter((e) => e.availability !== 'paused');
  const rank = (entry) =>
    preferred.includes(entry.manifest.id)
      ? preferred.indexOf(entry.manifest.id)
      : preferred.length;
  const picks = available.slice().sort((a, b) => rank(a) - rank(b));
  let selected = picks[0];
  let view = 'play';
  const recentEntries = recent
    .map((row) => entries.find((e) => e.manifest.id === row.id))
    .filter(Boolean);

  function showView(next, focus = false) {
    view = next;
    find('.console-hub').dataset.homeView = next;
    onView(next);
    animateIn(
      find(next === 'play' ? '.console-play-view' : '.console-library-view'),
    );
    find('.console-play-view').hidden = next !== 'play';
    find('.console-library-view').hidden = next === 'play';
    find('#console-library-title').textContent =
      next === 'library' ? 'Your library' : 'Discover';
    document.title = `${next === 'play' ? 'Play' : next === 'library' ? 'Library' : 'Discover'} — Akeru`;
    for (const button of main.querySelectorAll('[data-view]')) {
      const active = button.dataset.view === next;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    find('#recent-section').hidden =
      next !== 'library' || !recentEntries.length;
    if (focus) {
      const target = find(
        next === 'play' ? '#featured-launch' : '#console-library-title',
      );
      target.tabIndex = next === 'play' ? 0 : -1;
      target.focus();
    }
  }
  function select(entry) {
    selected = entry;
    setHeaderArt(main, entry);
    const copy = find('#featured-copy');
    const description = el(
      'p',
      'console-description',
      entry.manifest.id === 'open-golf'
        ? 'A little fresh air. One more round.'
        : entry.metadata.summary,
    );
    copy.replaceChildren(
      el('h1', '', entry.manifest.title),
      el(
        'p',
        'console-category',
        `${cap(entry.metadata.category)} · ${entry.manifest.id === 'open-golf' ? 'Single player' : 'Pick up & play'}`,
      ),
      description,
    );
    find('#featured-details').href = `/g/${entry.manifest.id}`;
    const backdrop = cover(entry, { label: false });
    find('#feature-scene').replaceChildren(backdrop);
    animateIn(backdrop, 0);
    animateIn(copy, 6);
    for (const button of main.querySelectorAll('.console-game-picker')) {
      const active = button.dataset.game === entry.manifest.id;
      button.setAttribute('aria-pressed', String(active));
    }
  }
  let launching = false;
  const launch = () => {
    if (!selected || launching || !onLaunch) return;
    launching = true;
    find('#featured-launch').disabled = true;
    find('#featured-launch span').textContent = 'Opening…';
    onLaunch(selected);
  };
  find('#featured-launch').onclick = launch;
  if (selected) select(selected);
  else {
    find('.console-stage').hidden = true;
    find('.console-shelf').hidden = true;
    find('.console-empty').hidden = false;
    find('[data-shortcut="play"]').disabled = true;
    find('[data-shortcut="details"]').disabled = true;
  }
  const shelf = picks.slice(0, 6);
  for (const entry of shelf) {
    const button = el('button', 'console-game-picker');
    button.type = 'button';
    button.dataset.game = entry.manifest.id;
    button.setAttribute('aria-label', `Feature ${entry.manifest.title}`);
    button.setAttribute('aria-pressed', String(entry === selected));
    button.append(
      cover(entry, { label: false }),
      el('span', 'console-game-name', entry.manifest.title),
    );
    button.onfocus = () => {
      if (entry !== selected) select(entry);
    };
    button.onclick = () => {
      if (entry !== selected) select(entry);
    };
    find('#console-shelf-cards').append(button);
  }
  const remaining = entries.filter((entry) => !shelf.includes(entry));
  const collections = [
    [
      'Action, racing & more',
      ['action', 'racing', 'sports', 'strategy', 'sandbox'],
    ],
    ['Puzzle breaks', ['puzzle']],
  ];
  for (const [title, categories] of collections) {
    const games = remaining.filter((entry) =>
      categories.includes(entry.metadata.category),
    );
    if (!games.length) continue;
    const section = el('section', 'console-collection');
    section.setAttribute('aria-label', title);
    const heading = el('div', 'console-collection-heading');
    heading.append(
      el('h2', '', title),
      el(
        'span',
        '',
        `${games.length} ${games.length === 1 ? 'game' : 'games'}`,
      ),
    );
    const grid = el('div', 'console-collection-grid');
    for (const entry of games) grid.append(gameCard(entry));
    section.append(heading, grid);
    find('.console-collections').append(section);
  }
  for (const entry of recentEntries.slice(0, 6))
    find('#recent-rail').append(gameCard(entry, true));
  for (const button of main.querySelectorAll('[data-view]'))
    button.onclick = () => showView(button.dataset.view);
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search games';
  search.maxLength = 120;
  search.setAttribute('aria-label', 'Search games');
  search.value = filters.query;
  find('#console-browse-all').textContent =
    `Browse all ${entries.length} ${entries.length === 1 ? 'game' : 'games'} →`;
  find('#console-browse-all').onclick = () => {
    filters.query = '';
    filters.category = 'all';
    search.value = '';
    update();
    showView('library', true);
  };
  const searchGames = (controller = false) => {
    showView('discover');
    search.focus();
    if (controller === true || document.body.dataset.input === 'controller')
      openConsoleKeyboard(search);
  };
  search.onclick = () => {
    if (document.body.dataset.input === 'controller')
      openConsoleKeyboard(search);
  };
  for (const button of main.querySelectorAll('[data-search]'))
    button.onclick = searchGames;
  find('[data-shortcut="play"]').onclick = launch;
  find('[data-shortcut="details"]').onclick = () => {
    if (selected) find('#featured-details').click();
  };
  const categoryButtons = [];
  for (const category of ['all', ...CATEGORIES]) {
    const button = el(
      'button',
      'filter',
      category === 'all' ? 'All games' : cap(category),
    );
    button.type = 'button';
    button.onclick = () => {
      filters.category = category;
      update();
    };
    find('#filters').append(button);
    categoryButtons.push([button, category]);
  }
  search.oninput = () => {
    filters.query = search.value;
    update();
  };
  find('#filters').append(search);
  const sort = el('select', 'console-sort');
  sort.setAttribute('aria-label', 'Sort games');
  for (const [value, label] of [
    ['default', 'Featured order'],
    ['title', 'Title A–Z'],
    ['recent', 'Last played'],
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
  find('#filters').append(sort);
  function update() {
    onFilters(filters);
    for (const [button, category] of categoryButtons)
      button.setAttribute(
        'aria-pressed',
        String(filters.category === category),
      );
    const results = filterEntries(entries, filters).slice();
    if (filters.sort === 'title')
      results.sort((a, b) => a.manifest.title.localeCompare(b.manifest.title));
    if (filters.sort === 'recent')
      results.sort(
        (a, b) =>
          (recent.find((r) => r.id === b.manifest.id)?.at ?? 0) -
          (recent.find((r) => r.id === a.manifest.id)?.at ?? 0),
      );
    find('#game-count').textContent =
      `${results.length} ${results.length === 1 ? 'game' : 'games'}`;
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
    } else {
      const tiles = el('div', 'console-library-grid');
      for (const entry of results) tiles.append(gameCard(entry));
      grid.append(tiles);
    }
  }
  const onKey = (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest('input, select, textarea, dialog')
    )
      return;
    if (event.key.toLowerCase() === 'y' || event.key === '/') {
      event.preventDefault();
      searchGames();
    }
    if (event.key.toLowerCase() === 'x' && selected)
      find('#featured-details').click();
    if (event.key.toLowerCase() === 'a' && view === 'play') launch();
    if (
      event.key === 'Enter' &&
      view === 'play' &&
      event.target.closest('.console-game-picker')
    ) {
      event.preventDefault();
      launch();
    }
    if (event.key === 'Escape' && view !== 'play') {
      event.preventDefault();
      showView('play', true);
    }
    if (
      view === 'play' &&
      selected &&
      event.target.closest('.console-game-picker') &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      const index = shelf.indexOf(selected);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? shelf.length - 1
            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + shelf.length) %
              shelf.length;
      select(shelf[next]);
      const target = find(
        `.console-game-picker[data-game="${shelf[next].manifest.id}"]`,
      );
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'instant',
      });
    }
  };
  main.addEventListener('keydown', onKey);
  const disposeChrome = bindConsoleChrome(main, {
    onTab: showView,
    onSearch: searchGames,
    sound,
  });
  const onNavigation = (event) => {
    const type = event.detail.type;
    const tabs = ['play', 'discover', 'library'];
    if (
      type === 'activate' &&
      view === 'play' &&
      document.activeElement.matches('.console-game-picker')
    ) {
      launch();
    } else if (type === 'nextTab' || type === 'previousTab') {
      showView(tabs[(tabs.indexOf(view) + (type === 'nextTab' ? 1 : 2)) % 3]);
      find(`.console-tabs [data-view="${view}"]`).focus({
        preventScroll: true,
      });
    } else if (type === 'search') searchGames(true);
    else if (type === 'details' && selected) {
      const focusedGame = document.activeElement.closest('a[href^="/g/"]');
      (focusedGame ?? find('#featured-details')).click();
    } else if (type === 'back') {
      if (view !== 'play') showView('play', true);
    } else return;
    event.preventDefault();
  };
  main.addEventListener('console-navigation', onNavigation);
  update();
  showView(initialView);
  return () => {
    disposeChrome();
    main.removeEventListener('console-navigation', onNavigation);
    main.removeEventListener('keydown', onKey);
    document.body.classList.remove('console-home-active');
  };
}
