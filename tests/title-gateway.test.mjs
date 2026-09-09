import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTitleGateway } from '../platform/hosting/title-gateway.mjs';
import { shellHeaders } from '../scripts/serve-staging.mjs';
import { changeAvailability } from '../scripts/availability.mjs';
const previous = 'a'.repeat(64), current = 'b'.repeat(64);
const bytes = { 'index.html': '<h1>Original fixture</h1>', 'game.js': '/* Original fixture */' };
const versions = [previous, current].map(digest => ({ digest, entry: 'index.html', files: Object.entries(bytes).map(([path, value]) => ({ path, size: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex'), type: path.endsWith('.html') ? 'text/html' : 'text/javascript' })) }));
const config = { titleId: 'fixture', titleOrigin: 'https://fixture.example.net', shellOrigin: 'https://shell.example.com', versions, headers: { ...shellHeaders, 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors https://shell.example.com" } };
function setup() {
 let availability = { schemaVersion: '1.0.0', generation: 0, titles: [{ id: 'fixture', paused: false, current, releases: [{ digest: previous, version: '1.0.0', saveSchemaVersion: 1 }, { digest: current, version: '1.1.0', saveSchemaVersion: 1 }] }] };
 const env = {
  REGISTRY: { fetch: async request => { assert.equal(request.headers.has('authorization'), false); assert.equal(request.redirect, 'manual'); return Response.json(availability.titles[0]); } },
  ASSETS: { fetch: async request => new Response(bytes[new URL(request.url).pathname.split('/').at(-1)]) },
 };
 const worker = createTitleGateway(config);
 return { env, request: (path, options) => worker.fetch(new Request(config.titleOrigin + path, options), env),
  update: (action, digest) => { availability = changeAvailability(availability, 'fixture', action, digest); } };
}

test('operator rollback changes new launches while active assets remain readable', async () => {
 const f = setup();
 let response = await f.request('/'); assert.equal(response.status, 302); assert.equal(response.headers.get('location'), `/releases/${current}/index.html`);
 assert.equal((await f.request(`/releases/${current}/index.html`)).status, 200);
 f.update('rollback', previous);
 response = await f.request('/'); assert.equal(response.headers.get('location'), `/releases/${previous}/index.html`);
 assert.equal((await f.request(`/releases/${current}/index.html`)).status, 409);
 assert.equal((await f.request(`/releases/${current}/game.js`)).status, 200);
 f.update('pause');
 for (const path of ['/', `/releases/${previous}/index.html`, `/releases/${current}/index.html`]) {
  response = await f.request(path); assert.equal(response.status, 410); assert.equal(response.headers.get('cache-control'), 'no-store');
 }
 assert.equal((await f.request(`/releases/${previous}/game.js`)).status, 200);
});

test('outage, wrong title state, unsupported methods and unknown paths fail closed', async () => {
 const f = setup();
 f.env.REGISTRY.fetch = async () => { throw new Error('offline'); };
 assert.equal((await f.request('/')).status, 503);
 f.env.REGISTRY.fetch = async () => Response.json({ id: 'other', paused: false, current });
 assert.equal((await f.request('/')).status, 503);
 assert.equal((await f.request('/', {method:'POST'})).status, 405);
 assert.equal((await f.request('/?data=unapproved')).status, 400);
 assert.equal((await f.request('/unknown')).status, 404);
 assert.equal((await f.request('/healthz')).status, 404);
});

test('gateway rejects same-origin hosting and unsafe artifact configurations', () => {
 assert.throws(() => createTitleGateway({ ...config, titleOrigin: config.shellOrigin }), /isolated/);
 assert.throws(() => createTitleGateway({ ...config, headers: shellHeaders }), /CSP/);
 const bad = structuredClone(versions); bad[0].files[0].path = '../index.html';
 assert.throws(() => createTitleGateway({ ...config, versions: bad }), /artifact/);
 for (const type of ['application/xhtml+xml', 'image/svg+xml', ' text/html']) {
  const active = structuredClone(versions); active[0].files[1].type = type;
  assert.throws(() => createTitleGateway({ ...config, versions: active }), /artifact/);
 }
 const noEntry = structuredClone(versions); noEntry[0].entry = 'game.js';
 assert.throws(() => createTitleGateway({ ...config, versions: noEntry }), /HTML/);
});
