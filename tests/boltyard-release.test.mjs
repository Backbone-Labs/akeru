import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverEndpoint } from '../packages/boltyard/build.mjs';
import {
  appendCatalog,
  exactOrigin,
  titleConfig,
  PUBLIC_SHELL,
} from '../scripts/package-boltyard-release.mjs';

test('game server endpoint must be a fixed wss /ws URL', () => {
  assert.equal(
    serverEndpoint('wss://game.example.com/ws'),
    'wss://game.example.com/ws',
  );
  assert.equal(serverEndpoint(null), null);
  for (const bad of [
    'ws://game.example.com/ws',
    'https://game.example.com/ws',
    'wss://game.example.com/other',
    'wss://game.example.com/ws?room=1',
    'wss://user:pw@game.example.com/ws',
  ])
    assert.throws(() => serverEndpoint(bad), /wss/);
});

test('title CSP only connects to the game server and only frames into the public shell', () => {
  const csp = titleConfig('wss://game.example.com/ws')
    .headers.flatMap((r) => r.headers)
    .find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(
    csp,
    /connect-src 'self' wss:\/\/game\.example\.com https:\/\/game\.example\.com;/,
  );
  assert.match(csp, new RegExp(`frame-ancestors ${PUBLIC_SHELL};`));
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|\*/);
  assert.throws(
    () => titleConfig('wss://game.example.com/ws', ['http://evil.example']),
    /origin/,
  );
});

test('origins are exact', () => {
  assert.throws(() => exactOrigin('https://a.example/path'), /origin/);
  assert.throws(() => exactOrigin('http://a.example'), /origin/);
});

test('the catalog gains BOLTYARD once and never silently replaces it', () => {
  const entry = {
    manifest: { id: 'boltyard' },
    release: { digest: 'a'.repeat(64) },
  };
  const catalog = { schemaVersion: '0.1.0', mode: 'demo', entries: [entry] };
  assert.throws(() => appendCatalog(catalog, entry), /already/);
  assert.throws(() => appendCatalog(catalog, entry, 'f'.repeat(64)), /already/);
});
