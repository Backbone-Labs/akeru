import { test, expect } from './fixtures.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
test('acquisition prompts cap frequency, exclude players and require analytics consent', async ({
  page,
}) => {
  const demo = await startCatalogDemo();
  try {
    await page.goto(demo.url + '/games');
    const result = await page.evaluate(async () => {
      const { createPromotions, promotionUrl } = await import('/promotions.js');
      const values = new Map();
      const storage = {
        getItem: (k) => values.get(k),
        setItem: (k, v) => values.set(k, v),
      };
      const events = [];
      let allow = false;
      const options = {
        storage,
        now: () => 1000,
        consent: () => allow,
        sink: (e) => events.push(e),
      };
      const root = document.createElement('div');
      document.body.append(root);
      const p = createPromotions(options);
      const excluded =
        p.mount(root, { path: '/play/freedoom1' }) === null &&
        p.mount(root, { path: '/g/freedoom1', embedded: true }) === null;
      const card = p.mount(root, { path: '/g/freedoom1' });
      const hrefs = [...card.querySelectorAll('a')].map((a) => a.href);
      card
        .querySelector('a')
        .addEventListener('click', (e) => e.preventDefault());
      card.querySelector('a').click();
      const before = events.length;
      allow = true;
      card.querySelector('a').click();
      card.querySelector('button').click();
      const capped =
        p.mount(root, { path: '/g/freedoom2' }) === null &&
        createPromotions(options).mount(root, { path: '/g/freedoom1' }) ===
          null;
      const afterWeek =
        createPromotions({ ...options, now: () => 1000 + 8 * 86400000 }).mount(
          root,
          { path: '/g/freedoom1' },
        ) !== null;
      let rejected = false;
      try {
        promotionUrl('https://attacker.invalid');
      } catch {
        rejected = true;
      }
      return { excluded, hrefs, before, events, capped, afterWeek, rejected };
    });
    expect(result.excluded).toBe(true);
    expect(result.before).toBe(0);
    expect(result.capped).toBe(true);
    expect(result.afterWeek).toBe(true);
    expect(result.rejected).toBe(true);
    expect(result.events[0]).toEqual({
      type: 'acquisition',
      action: 'click',
      kind: 'app',
    });
    for (const href of result.hrefs) {
      const url = new URL(href);
      expect(url.hostname).toBe('backbone.com');
      expect([...url.searchParams.keys()]).toEqual([
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
      ]);
    }
  } finally {
    await demo.close();
  }
});
