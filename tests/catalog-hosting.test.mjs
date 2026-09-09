import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { catalogHeaders, createCatalogWorker } from '../platform/hosting/catalog-worker.mjs';
const contents = { 'index.html': '<h1>Catalog</h1>', 'catalog.json': '{"schemaVersion":"0.1.0","mode":"production","entries":[]}', 'app.js': 'export const original = true;' };
const release = { revision: 'a'.repeat(40), digest: 'b'.repeat(64), titleOrigins: [], files: Object.entries(contents).map(([path, bytes]) => ({ path, size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), type: path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8' })) };
const worker = createCatalogWorker(release);
const env = { ASSETS: { fetch: async request => {
  assert.equal(request.redirect, 'manual'); assert.equal(request.method, 'GET'); assert.deepEqual([...request.headers], []);
  return new Response(contents[new URL(request.url).pathname.slice(1)]);
} } };
test('catalog deep links use the reviewed shell; caller credentials never reach assets', async () => {
  for (const path of ['/', '/g/original-title', '/app.js', '/catalog.json']) {
    const response = await worker.fetch(new Request(`https://catalog.invalid${path}`, { headers: { Authorization: 'private', Cookie: 'private', Range: 'bytes=0-1' } }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Security-Policy'), catalogHeaders()['Content-Security-Policy']);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Permissions-Policy').includes('gamepad=(self)'), true);
  }
  const head = await worker.fetch(new Request('https://catalog.invalid/g/original-title', { method: 'HEAD' }), env);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
test('catalog denies unknown routes, query-controlled state, writes and demo paths', async () => {
  for (const path of ['/g/', '/g/A', '/g/title/play', '/_demo', '/demo/index.html', '/.env', '/%2findex.html']) assert.equal((await worker.fetch(new Request(`https://catalog.invalid${path}`), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://catalog.invalid/?demo=true'), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://catalog.invalid/', { method: 'POST' }), env)).status, 405);
});
test('catalog rejects changed assets, redirects and unavailable bindings', async () => {
  for (const make of [() => new Response('tampered'), () => new Response(null, { status: 302, headers: { location: 'https://external.invalid/' } }), () => new Response('', { status: 404 })]) {
    assert.equal((await worker.fetch(new Request('https://catalog.invalid/'), { ASSETS: { fetch: async () => make() } })).status, 503);
  }
  assert.equal((await worker.fetch(new Request('https://catalog.invalid/'), {})).status, 503);
});
test('catalog release origins and files reject ambiguous or active assets', () => {
  for (const origin of ['http://title.invalid', 'https://title.invalid/path', 'https://title.invalid;script-src *', '*']) assert.throws(() => catalogHeaders([origin]));
  assert.match(catalogHeaders(['https://title.invalid'])['Content-Security-Policy'], /frame-src https:\/\/title.invalid;/);
  for (const change of [{ path: '../private.json' }, { type: 'image/svg+xml' }, { size: -1 }, { sha256: 'bad' }]) assert.throws(() => createCatalogWorker({ ...release, files: [{ ...release.files[0], ...change }, release.files[1]] }));
});
import { verifyHostedCatalog } from '../scripts/verify-hosted-catalog.mjs';
test('hosted catalog verification checks deep links, identities, headers and hashes', async () => {
  const fetcher = (url, options) => { assert.equal(options.redirect, 'error'); return worker.fetch(new Request(url), env); };
  assert.equal((await verifyHostedCatalog('https://catalog.invalid', release, fetcher)).verified, true);
  await assert.rejects(verifyHostedCatalog('http://catalog.invalid', release, fetcher), /HTTPS/);
  await assert.rejects(verifyHostedCatalog('https://catalog.invalid', { ...release, digest: 'c'.repeat(64) }, fetcher), /release mismatch/);
  await assert.rejects(verifyHostedCatalog('https://catalog.invalid', release, async () => new Response('{}')), /changed/);
});
