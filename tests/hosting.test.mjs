import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStagingWorker } from '../platform/hosting/worker.mjs';
import { shellHeaders } from '../scripts/serve-staging.mjs';
const bytes = '<h1>Original fixture</h1>';
const release = { revision: 'a'.repeat(40), digest: 'b'.repeat(64), files: [{ path: 'index.html', type: 'text/html; charset=utf-8', size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }] };
const worker = createStagingWorker(release, shellHeaders);

test('hosted adapter restricts paths/methods, strips caller secrets and enforces headers', async () => {
 let calls = 0;
 const env = { ASSETS: { fetch: async request => {
   calls++;
   assert.deepEqual([...request.headers], []);
   assert.equal(request.method, 'GET');
   assert.equal(request.redirect, 'manual');
   assert.equal(new URL(request.url).pathname, '/index.html');
   return new Response(bytes, { headers: { 'Set-Cookie': 'untrusted', 'Access-Control-Allow-Origin': '*' } });
 } } };
 const page = await worker.fetch(new Request('https://example.invalid/', { headers: { Cookie: 'private', Authorization: 'private', Range: 'bytes=0-1' } }), env);
 assert.equal(page.status, 200); assert.equal(await page.text(), bytes);
 assert.equal(page.headers.get('set-cookie'), null); assert.equal(page.headers.get('access-control-allow-origin'), null);
 assert.equal(page.headers.get('content-security-policy'), shellHeaders['Content-Security-Policy']);
 assert.equal(page.headers.get('strict-transport-security'), 'max-age=31536000');
 for (const path of ['/unknown', '/.env', '//index.html', '/%2findex.html']) assert.equal((await worker.fetch(new Request(`https://example.invalid${path}`), env)).status, 404);
 assert.equal((await worker.fetch(new Request('https://example.invalid/', { method: 'POST' }), env)).status, 405);
 assert.equal(calls, 1);
});

test('hosted adapter fails closed on changed bytes, redirects, missing assets and binding errors', async () => {
 for (const response of [new Response('changed'), new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid' } }), new Response('', { status: 404 })]) {
   assert.equal((await worker.fetch(new Request('https://example.invalid/'), { ASSETS: { fetch: async () => response } })).status, 503);
 }
 assert.equal((await worker.fetch(new Request('https://example.invalid/'), {})).status, 503);
});

test('health identifies exact release; HEAD never exposes body', async () => {
 const health = await worker.fetch(new Request('https://example.invalid/healthz'), {});
 assert.deepEqual(await health.json(), { status: 'ok', revision: release.revision, releaseDigest: release.digest, gamesEnabled: false });
 const head = await worker.fetch(new Request('https://example.invalid/', { method: 'HEAD' }), { ASSETS: { fetch: async () => new Response(bytes) } });
 assert.equal(head.status, 200); assert.equal(await head.text(), '');
});

import { verifyHostedStaging } from '../scripts/verify-hosted-staging.mjs';
test('deployment verifier checks current source, headers and actual asset bytes', async () => {
 const fetcher = (url, options) => {
   assert.equal(options.redirect, 'error');
   return worker.fetch(new Request(url), { ASSETS: { fetch: async () => new Response(bytes) } });
 };
 const result = await verifyHostedStaging('https://example.invalid', release, fetcher);
 assert.equal(result.verified, true);
 await assert.rejects(verifyHostedStaging('http://example.invalid', release, fetcher), /HTTPS/);
 await assert.rejects(verifyHostedStaging('https://example.invalid', { ...release, revision: 'c'.repeat(40) }, fetcher), /revision/);
 await assert.rejects(verifyHostedStaging('https://example.invalid', release, async () => new Response('{}')), /missing or changed/);
});
