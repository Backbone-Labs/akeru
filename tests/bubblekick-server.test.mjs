import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  originSet,
  allowUpgrade,
} from '../packages/bubblekick/server/policy.mjs';
test('Bubble Kick requires exact HTTPS origins and fails closed', () => {
  for (const bad of [
    '',
    'http://example.com',
    'https://example.com/path',
    'https://user:pw@example.com',
  ])
    assert.throws(() => originSet(bad));
  const allowed = originSet('https://game.example');
  assert.equal(
    allowUpgrade(
      { url: '/ws', headers: { origin: 'https://game.example' } },
      allowed,
      0,
    ),
    true,
  );
  for (const origin of [
    undefined,
    'null',
    'https://evil.example',
    'https://game.example.evil',
  ])
    assert.equal(
      allowUpgrade({ url: '/ws', headers: { origin } }, allowed, 0),
      false,
    );
  assert.equal(
    allowUpgrade(
      { url: '/ws?x=1', headers: { origin: 'https://game.example' } },
      allowed,
      0,
    ),
    false,
  );
  assert.equal(
    allowUpgrade(
      { url: '/ws', headers: { origin: 'https://game.example' } },
      allowed,
      128,
    ),
    false,
  );
});
