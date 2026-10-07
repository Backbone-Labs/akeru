import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBubblekick,
  serverEndpoint,
} from '../packages/bubblekick/build.mjs';
import {
  appendCatalog,
  titleConfig,
  METADATA,
} from '../scripts/package-bubblekick-release.mjs';
test('Bubble Kick rejects missing revision and unsafe multiplayer endpoints', () => {
  assert.throws(() => buildBubblekick({ source: '/unused' }), /full commit/);
  assert.equal(
    serverEndpoint('wss://game.example/ws'),
    'wss://game.example/ws',
  );
  for (const bad of [
    'ws://game.example/ws',
    'wss://user:pw@game.example/ws',
    'wss://game.example/ws?x=1',
  ])
    assert.throws(() => serverEndpoint(bad));
});
test('offline release has no network permission to game servers', () => {
  const csp = titleConfig(null)
    .headers.flatMap((r) => r.headers)
    .find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|wss:/);
  assert.match(METADATA.description, /Online rooms are not enabled/);
});
test('catalog refuses silent replacement', () => {
  const entry = {
    manifest: { id: 'bubblekick' },
    release: { digest: 'a'.repeat(64) },
  };
  assert.throws(() => appendCatalog({ entries: [entry] }, entry), /already/);
});
