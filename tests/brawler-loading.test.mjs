import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
test('large game cold starts survive a minute but still have a hard deadline', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events = [];
  const config = {
    frame: { postMessage() {} },
    origin: 'https://games.example',
    nonce: 'a'.repeat(32),
    timeoutMs: 180000,
    onEvent: (e) => events.push(e),
  };
  assert.throws(() => createRuntimeChannel({ ...config, timeoutMs: 180001 }));
  const c = createRuntimeChannel(config);
  t.mock.timers.tick(60001);
  assert.equal(c.state, 'loading');
  assert.deepEqual(events, []);
  t.mock.timers.tick(120000);
  assert.equal(c.state, 'closed');
  assert.deepEqual(events, [{ type: 'error', code: 'timeout' }]);
});
