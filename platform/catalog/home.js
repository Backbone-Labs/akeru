import { CATEGORIES, filterEntries } from './model.js';
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
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const cap = (text) => text[0].toUpperCase() + text.slice(1);
function cover(entry, cls = '') {
  const art = el('div', `console-art ${entry.metadata.category} ${cls}`);
  if (entry.metadata.cover) {
    const image = el('img');
    image.src = entry.metadata.cover;
    image.alt = '';
    image.loading = 'lazy';
    art.append(image);
  } else {
    art.append(
      el(
        'span',
        'cover-monogram',
        entry.manifest.title.slice(0, 2).toUpperCase(),
      ),
    );
  }
  return art;
}
function card(entry, compact = false) {
  const a = el('a', compact ? 'recent-card' : 'game-card console-card');
  a.href = `/g/${entry.manifest.id}`;
  const art = cover(entry);
  art.append(el('span', 'card-tag', cap(entry.metadata.category)));
  const text = el('div', 'card-copy');
  text.append(el('h3', '', entry.manifest.title));
  if (!compact) text.append(el('p', '', entry.metadata.summary));
  text.append(
    el(
      'span',
      'console-card-action',
      entry.availability === 'paused'
        ? 'Temporarily unavailable'
        : 'Play now ↗',
    ),
  );
  a.append(art, text);
  return a;
}
export function renderGameHome(main, entries, { filters, recent, onFilters }) {
  main.innerHTML =
    '<div class="wrap console-home"><header class="console-heading"><div><p class="eyebrow">BACKBONE / OPEN GAMES</p><h1>Find your next.</h1><p class="console-subtitle">A whole world of play. Already here.</p></div><a class="console-setup-link" href="/settings">⚙ Your setup</a></header><div id="console-discovery"></div><section id="recent-section" hidden><div class="section-head"><div><p class="eyebrow">ON THIS BROWSER</p><h2>Jump back in.</h2></div><span class="fine">Recently played</span></div><div class="recent-rail" id="recent-rail"></div></section><section id="collection-section"><div class="section-head"><h2>Discover your kind of play.</h2><span class="fine">Something for every mood</span></div><div class="collection-rail" id="collection-rail"></div></section><section id="all-games"><div class="section-head"><h2>All games.</h2><span id="game-count" class="count" aria-live="polite"></span></div><div class="filters" id="filters" role="group" aria-label="Filter games"></div><div id="game-grid"></div></section></div>';
  const find = (s) => main.querySelector(s);
  const featured = entries.find((e) => e.availability !== 'paused');
  if (featured) {
    const feature = el('section', 'console-feature');
    const art = cover(featured, 'feature-art');
    const copy = el('div', 'feature-copy');
    copy.append(
      el('p', 'eyebrow', 'IN THE SPOTLIGHT'),
      el('h2', '', featured.manifest.title),
      el('p', '', featured.metadata.summary),
    );
    const open = el('a', 'primary', 'Explore game ↗');
    open.href = `/g/${featured.manifest.id}`;
    copy.append(open);
    feature.append(art, copy);
    const aside = el('div', 'feature-aside');
    aside.append(
      el('p', 'eyebrow', 'PICK UP & PLAY'),
      el('h2', '', 'Less waiting.\nMore playing.'),
      el(
        'p',
        '',
        'Choose a game. Bring your controller, or use keyboard, mouse and touch.',
      ),
    );
    const count = el(
      'span',
      'feature-total',
      String(entries.length).padStart(2, '0'),
    );
    aside.append(count, el('span', 'fine', 'games to discover'));
    const row = el('div', 'feature-row');
    row.append(feature, aside);
    find('#console-discovery').append(row);
  }
  const recentEntries = recent
    .map((row) => entries.find((e) => e.manifest.id === row.id))
    .filter(Boolean)
    .slice(0, 8);
  if (recentEntries.length) {
    find('#recent-section').hidden = false;
    for (const e of recentEntries) find('#recent-rail').append(card(e, true));
  }
  const moods = [
    ['action', 'Turn it up.', 'Fast moves. Big energy.'],
    ['puzzle', 'Find your focus.', 'A little room to think.'],
    ['sandbox', 'Make it yours.', 'Build something unexpected.'],
    ['sports', 'One more round.', 'Find your competitive side.'],
    ['strategy', 'Think ahead.', 'Make every move count.'],
  ];
  for (const [category, title, description] of moods) {
    const count = entries.filter(
      (e) => e.metadata.category === category,
    ).length;
    if (!count) continue;
    const tile = el('button', `collection-tile collection-${category}`);
    tile.type = 'button';
    tile.append(
      el('span', 'eyebrow', `${count} ${count === 1 ? 'GAME' : 'GAMES'}`),
      el('strong', '', title),
      el('span', '', description),
      el('span', 'collection-arrow', '↗'),
    );
    tile.onclick = () => {
      filters.category = category;
      update();
      find('#all-games').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    };
    find('#collection-rail').append(tile);
  }
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
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search your next game';
  search.maxLength = 120;
  search.setAttribute('aria-label', 'Search games');
  search.value = filters.query;
  search.oninput = () => {
    filters.query = search.value;
    update();
  };
  find('#filters').append(search);
  const sort = el('select', 'console-sort');
  sort.setAttribute('aria-label', 'Sort games');
  for (const [value, text] of [
    ['default', 'Featured order'],
    ['title', 'Title A–Z'],
    ['recent', 'Last played'],
  ]) {
    const option = el('option', '', text);
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
          'h3',
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
    const tiles = el('div', 'grid console-grid');
    for (const entry of results) tiles.append(card(entry));
    grid.append(tiles);
  }
  update();
}
