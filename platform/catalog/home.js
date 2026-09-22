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
    <div class="wrap console-home discover-v2">
      <header class="discovery-intro">
        <div><p class="eyebrow"><span class="live-dot"></span> BACKBONE / AKERU</p><h1>Less waiting.<br><span>More playing.</span></h1><p>Great games. Wide open. Find your next favorite and make yourself at home.</p></div>
        <div class="discovery-meta"><span id="library-total"></span><p>Free to explore.<br>Nothing to install.</p><a href="#all-games" class="browse-library">Explore the library ↓</a></div>
      </header>
      <section class="spotlight" aria-label="Spotlight games" aria-roledescription="carousel">
        <div class="spotlight-heading"><p class="eyebrow">IN THE SPOTLIGHT</p><div class="spotlight-navigation"><span id="spotlight-position" aria-live="polite"></span><button type="button" id="spotlight-prev" aria-label="Previous spotlight games">←</button><button type="button" id="spotlight-next" aria-label="Next spotlight games">→</button></div></div>
        <div id="spotlight-track" class="spotlight-track" tabindex="0" aria-label="Scroll spotlight games"></div>
        <div class="spotlight-caption"><span>YOUR NEXT “ONE MORE ROUND.”</span><span>Swipe, scroll, or explore →</span></div>
      </section>
      <section class="backbone-hub" aria-label="Play your way">
        <div class="controller-story"><div class="controller-graphic" aria-hidden="true"><svg viewBox="0 0 320 150" fill="none"><path d="M91 28h138c26 0 40 17 47 42l14 48c5 23-19 35-35 18l-31-30H96l-31 30c-16 17-40 5-35-18l14-48c7-25 21-42 47-42Z" fill="#303234" stroke="#666" stroke-width="2"/><path d="M75 56v34M58 73h34" stroke="#a4a7aa" stroke-width="11" stroke-linecap="round"/><circle cx="124" cy="89" r="17" fill="#18191a" stroke="#777" stroke-width="3"/><circle cx="194" cy="89" r="17" fill="#18191a" stroke="#777" stroke-width="3"/><g fill="#c4c4c4"><circle cx="242" cy="53" r="6"/><circle cx="257" cy="68" r="6"/><circle cx="227" cy="68" r="6"/><circle cx="242" cy="83" r="6"/></g><circle cx="160" cy="60" r="7" fill="#ff5b20"/></svg><span class="controller-orbit"></span></div>
        <div><p class="eyebrow">PUT PLAY IN YOUR HANDS</p><h2>Better with<br>a Backbone.</h2><p>Feel every turn. Own every move. Connect your controller, or keep playing with touch, keyboard and mouse.</p><div class="hub-actions" id="controller-actions"><a href="/settings" class="primary">Set up your controller ↗</a></div><details class="pairing-help"><summary>How do I connect?</summary><p>For a wired Backbone, connect it to your phone. For Backbone Pro wireless play, pair it in your device’s Bluetooth settings, return here, then press a controller button. Browser pairing isn’t available from this page.</p></details></div></div>
        <div class="app-story"><div class="phone-preview" aria-hidden="true"><div class="phone-camera"></div><div id="phone-game-art"></div><span>PLAY. ANYWHERE.</span></div><div><p class="eyebrow">TAKE PLAY WITH YOU</p><h2>Your phone.<br>Your next console.</h2><p>Open Akeru in your phone’s browser for instant play. Get the Backbone app to bring your games, platforms and controller together.</p><div class="hub-actions" id="app-actions"></div><p class="device-note">iPhone + Android · No account needed for browser play</p></div></div>
      </section>
      <section id="recent-section" hidden><div class="section-head"><div><p class="eyebrow">RIGHT WHERE YOU LEFT OFF</p><h2>Jump back in.</h2></div><span class="fine">Played in this browser</span></div><div class="recent-rail" id="recent-rail"></div></section>
      <section id="collection-section"><div class="section-head"><h2>Find your kind of play.</h2><span class="fine">Follow your mood</span></div><div class="collection-rail" id="collection-rail"></div></section>
      <section id="all-games"><div class="section-head"><div><p class="eyebrow">THE WHOLE PLAYGROUND</p><h2>All games.</h2></div><span id="game-count" class="count" aria-live="polite"></span></div><div class="filters" id="filters" role="group" aria-label="Filter games"></div><div id="game-grid"></div></section>
    </div>`;
  const find = (s) => main.querySelector(s);
  find('.browse-library').onclick = (event) => {
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
  find('#library-total').textContent = String(entries.length).padStart(2, '0');
  const candidates = entries.filter((e) => e.availability !== 'paused');
  const preferred = [
    'freedoom1',
    'old-san-juan-kart',
    'open-golf',
    'hextris',
    'anarch',
    'server-survival',
  ];
  const picks = [...candidates]
    .sort((a, b) => {
      const score = (e) =>
        preferred.includes(e.manifest.id)
          ? preferred.indexOf(e.manifest.id)
          : preferred.length;
      return score(a) - score(b);
    })
    .slice(0, 6);
  const track = find('#spotlight-track');
  for (const [index, entry] of picks.entries()) {
    const tile = el('a', 'spotlight-tile');
    tile.href = '/g/' + entry.manifest.id;
    tile.setAttribute('aria-label', 'Explore ' + entry.manifest.title);
    const art = cover(entry, 'spotlight-art');
    const img = art.querySelector('img');
    if (img && index < 2) img.loading = 'eager';
    art.append(el('span', 'spotlight-genre', cap(entry.metadata.category)));
    const text = el('div', 'spotlight-copy');
    text.append(
      el('span', 'spotlight-number', String(index + 1).padStart(2, '0')),
      el('h2', '', entry.manifest.title),
      el('p', '', entry.metadata.summary),
      el('span', 'spotlight-play', 'Explore game ↗'),
    );
    tile.append(art, text);
    track.append(tile);
  }
  const prev = find('#spotlight-prev'),
    next = find('#spotlight-next');
  const move = (direction) =>
    track.scrollBy({
      left:
        direction *
        (track.firstElementChild?.getBoundingClientRect().width + 28 || 320),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  prev.onclick = () => move(-1);
  next.onclick = () => move(1);
  track.addEventListener('keydown', (e) => {
    if (e.target === track && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      move(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  const progress = () => {
    const max = track.scrollWidth - track.clientWidth;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max - 2;
    const index = Math.min(
      picks.length,
      Math.round(
        track.scrollLeft /
          ((track.firstElementChild?.getBoundingClientRect().width ?? 1) + 28),
      ) + 1,
    );
    find('#spotlight-position').textContent = picks.length
      ? String(index).padStart(2, '0') +
        ' / ' +
        String(picks.length).padStart(2, '0')
      : 'Coming soon';
  };
  track.addEventListener('scroll', progress, { passive: true });
  const resize = new ResizeObserver(progress);
  resize.observe(track);
  progress();
  for (const [kind, root, label] of [
    ['controller', '#controller-actions', 'Shop Backbone ↗'],
    ['app', '#app-actions', 'Get the Backbone app ↗'],
  ]) {
    const link = el('a', kind === 'app' ? 'primary' : 'hub-text-link', label);
    link.href = promotionUrl(kind);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', () => onPromotion(kind));
    find(root).append(link);
  }
  if (picks.length) find('#phone-game-art').append(cover(picks[0]));
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
  return () => resize.disconnect();
}
