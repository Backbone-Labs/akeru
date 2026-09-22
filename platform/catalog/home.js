import { promotionUrl } from './promotions.js';
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
export function renderGameHome(
  main,
  entries,
  { filters, recent, onFilters, onPromotion = () => {} },
) {
  main.innerHTML = `
    <div class="wrap console-home discover-studio">
      <header class="library-heading"><div><p class="eyebrow">BACKBONE AKERU</p><h1>Discover</h1></div><div class="library-heading-tools"><span>Open games. Ready to play.</span><a class="studio-link" href="/settings">Your setup ↗</a></div></header>
      <section class="feature-stage" aria-label="Featured games" aria-roledescription="carousel">
        <div id="feature-scene" class="feature-scene"></div>
        <div class="feature-stage-content"><p class="feature-kicker"><span></span> THE OPEN COLLECTION</p><div id="featured-copy" aria-live="polite"></div><div class="feature-stage-actions"><a id="featured-launch" class="studio-play">▶ <span>Explore game</span></a><a class="studio-browse" href="#all-games">Browse all games ↓</a></div><p class="feature-footnote">No download. No account. Just play.</p></div>
        <div class="feature-stage-index"><span id="spotlight-position"></span><button type="button" id="spotlight-prev" aria-label="Previous featured game">←</button><button type="button" id="spotlight-next" aria-label="Next featured game">→</button></div>
      </section>
      <div id="spotlight-track" class="selection-rail" role="group" aria-label="Choose a featured game"></div>
      <section class="hardware-band" aria-label="Play with Backbone"><div class="hardware-copy"><p class="eyebrow">MADE FOR YOUR HANDS</p><h2>Meet your player two.</h2><p>Bring a Backbone to the game.<br>Or jump in with the controls you already have.</p><div id="controller-actions" class="hardware-actions"><a class="studio-button" href="/settings">Connect a controller ↗</a></div><details class="pairing-help"><summary>Pairing a Backbone Pro?</summary><p>Put your Backbone Pro in pairing mode and connect in your device’s Bluetooth settings. Return here and press a button. For wired play, connect your Backbone directly to your phone.</p></details></div><div class="hardware-image"><img src="https://backbone.com/cdn/shop/files/04-09-25_Niji_3Quarter_Light-BG.png?v=1774547122&width=800" alt="Backbone Pro wireless controller" loading="lazy" referrerpolicy="no-referrer" width="800" height="450"><span>BACKBONE PRO <span>HANDHELD + WIRELESS</span></span></div></section>
      <section class="app-invitation" aria-label="Backbone on your phone"><div class="app-emblem" aria-hidden="true"><svg viewBox="0 0 111 104"><use href="#backbone-mark"/></svg></div><div><p class="eyebrow">YOUR PHONE IS A PLACE TO PLAY</p><h2>Take your next session with you.</h2><p>Play Akeru in your phone’s browser. Explore the Backbone app to bring your games and platforms together.</p><span class="fine">iPhone & Android · Browser progress stays on this device</span></div><div id="app-actions"></div></section>
      <section id="recent-section" hidden><div class="section-head"><div><p class="eyebrow">RECENTLY PLAYED</p><h2>Jump back in</h2></div><span class="fine">On this browser</span></div><div class="recent-rail" id="recent-rail"></div></section>
      <section id="collection-section"><div class="section-head"><h2>Pick your pace</h2><span class="fine">Something for every kind of player</span></div><div class="collection-rail" id="collection-rail"></div></section>
      <section id="all-games"><div class="section-head"><div><p class="eyebrow">YOUR NEXT GOOD GAME</p><h2>The library</h2></div><span id="game-count" class="count" aria-live="polite"></span></div><div class="filters" id="filters" role="group" aria-label="Filter games"></div><div id="game-grid"></div></section>

    </div>`;
  const find = (selector) => main.querySelector(selector);
  find('.studio-browse').onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const library = find('#all-games');
    library.tabIndex = -1;
    library.focus({ preventScroll: true });
    library.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  const preferred = [
    'freedoom1',
    'open-golf',
    'old-san-juan-kart',
    'hextris',
    'anarch',
    'server-survival',
  ];
  const picks = entries
    .filter((e) => e.availability !== 'paused')
    .sort((a, b) => {
      const rank = (e) =>
        preferred.includes(e.manifest.id)
          ? preferred.indexOf(e.manifest.id)
          : preferred.length;
      return rank(a) - rank(b);
    })
    .slice(0, 6);
  const rail = find('#spotlight-track');
  let selected = 0;
  const buttons = [];
  let sceneAnimation;
  function select(index, reveal = false) {
    if (!picks.length) return;
    selected = Math.max(0, Math.min(index, picks.length - 1));
    const entry = picks[selected];
    const scene = find('#feature-scene');
    const art = cover(entry, 'stage-art');
    const image = art.querySelector('img');
    if (image) image.loading = 'eager';
    sceneAnimation?.cancel();
    scene.replaceChildren(art);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      sceneAnimation = scene.animate(
        [
          { opacity: 0.65, transform: 'scale(1.015)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)' },
      );
    const copy = find('#featured-copy');
    copy.replaceChildren(
      el(
        'p',
        'feature-category',
        cap(entry.metadata.category) + ' / Open-source',
      ),
      el('h2', '', entry.manifest.title),
      el('p', 'feature-description', entry.metadata.summary),
    );
    find('#featured-launch').href = '/g/' + entry.manifest.id;
    find('#spotlight-position').textContent =
      String(selected + 1).padStart(2, '0') +
      ' / ' +
      String(picks.length).padStart(2, '0');
    find('#spotlight-prev').disabled = selected === 0;
    find('#spotlight-next').disabled = selected === picks.length - 1;
    buttons.forEach((button, i) =>
      button.setAttribute('aria-pressed', String(i === selected)),
    );
    if (reveal) {
      const button = buttons[selected];
      const target =
        button.offsetLeft -
        rail.offsetLeft -
        (rail.clientWidth - button.clientWidth) / 2;
      rail.scrollTo({
        left: target,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  }
  picks.forEach((entry, index) => {
    const button = el('button', 'selection-item');
    button.type = 'button';
    button.setAttribute('aria-label', 'Feature ' + entry.manifest.title);
    const text = el('span', 'selection-text');
    text.append(
      el('strong', '', entry.manifest.title),
      el('span', '', cap(entry.metadata.category)),
    );
    button.append(cover(entry, 'selection-art'), text);
    button.onclick = () => select(index, true);
    button.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      select(
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? picks.length - 1
            : selected + (e.key === 'ArrowLeft' ? -1 : 1),
        true,
      );
      buttons[selected].focus({ preventScroll: true });
    };
    buttons.push(button);
    rail.append(button);
  });
  find('#spotlight-prev').onclick = () => select(selected - 1, true);
  find('#spotlight-next').onclick = () => select(selected + 1, true);
  if (picks.length) select(0);
  else {
    find('.feature-stage').hidden = true;
    rail.hidden = true;
  }
  for (const [kind, root, label] of [
    ['controller', '#controller-actions', 'Shop Backbone ↗'],
    ['app', '#app-actions', 'Get the Backbone app ↗'],
  ]) {
    const link = el(
      'a',
      kind === 'app' ? 'studio-button' : 'studio-link',
      label,
    );
    link.href = promotionUrl(kind);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.onclick = () => onPromotion(kind);
    find(root).append(link);
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
    ['action', 'Action', 'Fast hands. Faster decisions.'],
    ['puzzle', 'Puzzle', 'Find a little flow.'],
    ['sandbox', 'Sandbox', 'Make it your own.'],
    ['sports', 'Sports', 'One more round.'],
    ['strategy', 'Strategy', 'Stay one move ahead.'],
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
  return () => sceneAnimation?.cancel();
}
