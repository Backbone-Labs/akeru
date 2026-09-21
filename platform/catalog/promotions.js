/** Shell-owned acquisition prompts. Never receives title messages or account data. */
const KEY = 'akeru.promotion.v1';
const DAY = 86400000;
const destinations = Object.freeze({
  app: 'https://backbone.com/download',
  controller: 'https://backbone.com/products/',
});
export function promotionUrl(kind) {
  if (!Object.hasOwn(destinations, kind)) throw new Error('Unknown promotion');
  const url = new URL(destinations[kind]);
  url.searchParams.set('utm_source', 'akeru');
  url.searchParams.set('utm_medium', 'web');
  url.searchParams.set('utm_campaign', 'open_games');
  url.searchParams.set('utm_content', kind);
  return url.href;
}
export function createPromotions({
  storage,
  now = Date.now,
  consent = () => false,
  sink,
} = {}) {
  let shown = false;
  let suppressedUntil = 0;
  try {
    const value = Number(storage?.getItem(KEY));
    if (Number.isFinite(value) && value > 0) suppressedUntil = value;
  } catch {
    /* In-memory session cap still applies. */
  }
  function record(action, kind) {
    // Closed schema: no URL, referrer, title, user ID, save content or credentials.
    try {
      if (consent() === true) sink?.({ type: 'acquisition', action, kind });
    } catch {
      /* Analytics cannot block navigation or play. */
    }
  }
  function suppress(days) {
    suppressedUntil = now() + days * DAY;
    try {
      storage?.setItem(KEY, String(suppressedUntil));
    } catch {
      /* optional */
    }
  }
  return {
    mount(root, { path, embedded = false } = {}) {
      if (
        embedded ||
        !/^\/g\/[a-z0-9][a-z0-9-]*$/.test(path ?? '') ||
        shown ||
        now() < suppressedUntil
      )
        return null;
      shown = true;
      suppress(1);
      const doc = root.ownerDocument;
      const section = doc.createElement('section');
      section.className = 'acquisition-card';
      section.setAttribute('aria-label', 'More ways to play');
      const heading = doc.createElement('h3');
      heading.textContent = 'More ways to play.';
      const description = doc.createElement('p');
      description.textContent =
        'Explore the Backbone app or find your controller. Playing here stays free.';
      section.append(heading, description);
      for (const [kind, label] of [
        ['app', 'Get the app'],
        ['controller', 'Get a controller'],
      ]) {
        const a = doc.createElement('a');
        a.textContent = label;
        a.href = promotionUrl(kind);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.addEventListener('click', () => record('click', kind));
        section.append(a);
      }
      const dismiss = doc.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = 'Not now';
      dismiss.addEventListener('click', () => {
        suppress(7);
        record('dismiss', 'both');
        section.remove();
      });
      section.append(dismiss);
      root.append(section);
      record('shown', 'both');
      return section;
    },
  };
}
