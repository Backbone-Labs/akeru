import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exactOrigin,
  relayEndpoint,
  configForTitle,
  filesUnder,
  appendCatalog,
  verifyBaseline,
} from '../scripts/package-red-eclipse-preview.mjs';
const endpoint = 'wss://example.run.app/relay';
test('relay rejects insecure, credentialed, arbitrary-path and query-controlled endpoints', () => {
  for (const bad of [
    'ws://example.run.app/relay',
    'wss://u:p@example.run.app/relay',
    'wss://example.run.app/anything',
    'wss://example.run.app/relay?target=other',
    'wss://example.run.app/relay#x',
  ])
    assert.throws(() => relayEndpoint(bad));
  assert.equal(relayEndpoint(endpoint), endpoint);
});
test('title network policy permits only its own origin and one fixed relay', () => {
  const config = configForTitle(endpoint);
  const csp = config.headers[0].headers.find(
    (h) => h.key === 'Content-Security-Policy',
  ).value;
  assert.match(csp, /connect-src 'self' wss:\/\/example\.run\.app;/);
  assert.match(csp, /worker-src 'none'/);
  assert.doesNotMatch(csp, /connect-src[^;]*\*/);
  assert.match(csp, /frame-ancestors https:\/\/backbone-akeru\.vercel\.app;/);
  assert.throws(() => configForTitle(endpoint, ['https://example.test/path']));
});
test('release traversal refuses symlinks and excludes hidden deployment credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'red-package-'));
  try {
    writeFileSync(join(dir, 'ok.js'), 'x');
    writeFileSync(join(dir, '.env'), 'secret');
    assert.deepEqual(filesUnder(dir), [join(dir, 'ok.js')]);
    symlinkSync('/etc/passwd', join(dir, 'escape'));
    assert.throws(() => filesUnder(dir), /Symlinks/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const entry = (id) => ({
  manifest: {
    specVersion: '0.1.0',
    id,
    title: id,
    version: '0.1.0',
    entry: 'index.html',
    input: { controller: true, touch: true },
    saves: { guestLocal: true, accountSync: 'disabled' },
    provenance: {
      source: {
        url: 'https://example.test/source',
        revision: 'a'.repeat(40),
        license: 'MIT',
      },
    },
  },
  release: { origin: `https://${id}.example.test`, digest: 'a'.repeat(64) },
  metadata: {
    summary: 'A game',
    description: 'Description',
    category: 'action',
    creator: 'Creators',
    ageLabel: 'Unrated',
    controls: { controller: ['Move'], touch: ['Move'] },
    privacy: ['Local'],
    notices: [{ label: 'Source', url: 'https://example.test/source' }],
  },
  availability: 'available',
});
test('catalog addition preserves every existing game and rejects duplicate or same-origin title', () => {
  const original = {
    schemaVersion: '0.1.0',
    mode: 'demo',
    entries: [entry('old-game')],
  };
  const before = JSON.stringify(original);
  const result = appendCatalog(original, entry('red-eclipse'));
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(result.entries[0], original.entries[0]);
  assert.equal(result.entries.length, 2);
  assert.throws(
    () => appendCatalog(original, entry('old-game')),
    /explicit review/,
  );
  const collision = entry('red-eclipse');
  collision.release.origin = original.entries[0].release.origin;
  assert.throws(() => appendCatalog(original, collision), /isolated/);
});
test('baseline verification refuses drift instead of overwriting the deployed site', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'red-baseline-'));
  const original = globalThis.fetch;
  try {
    writeFileSync(join(dir, 'index.html'), 'local');
    globalThis.fetch = async () => new Response('different');
    await assert.rejects(verifyBaseline(dir), /Live baseline differs/);
  } finally {
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
test('immutable origin helper rejects path and credentials', () => {
  assert.equal(exactOrigin('https://example.test'), 'https://example.test');
  assert.throws(() => exactOrigin('https://example.test/path'));
  assert.throws(() => exactOrigin('https://a:b@example.test'));
});

test('published Python recipe uses environment workspace instead of account paths', async () => {
  const { sanitizeRecipe } =
    await import('../scripts/package-red-eclipse-preview.mjs');
  const source =
    "source=pathlib.Path('/tmp/akeru-red-eclipse-browser-source')\n";
  const publicCopy = sanitizeRecipe(source, true);
  assert.match(publicCopy, /os\.environ\['RED_ECLIPSE_WORKSPACE'\]/);
  assert.doesNotMatch(publicCopy, /\/tmp\/akeru/);
  assert.throws(
    () =>
      sanitizeRecipe(
        "path='" + ['', 'Users', 'example', 'private'].join('/') + "'",
        false,
      ),
    /Private home path/,
  );
});
