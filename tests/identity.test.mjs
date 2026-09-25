import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionClient } from '../packages/identity/src/index.js';

const origin = 'https://shell.invalid';
const partitionA = 'a'.repeat(32);
const partitionB = 'b'.repeat(32);
const csrfToken = 'c'.repeat(32);
const signedIn = (partition = partitionA, extra = {}) => ({
  status: 'authenticated',
  partition,
  expiresAt: Date.now() + 60000,
  csrfToken,
  ...extra,
});
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

function client(t, fetch, options = {}) {
  const result = createSessionClient({ origin, fetch, ...options });
  t.after(() => result.dispose());
  return result;
}

test('identity requests stay on the shell origin with cookie, redirect and cache restrictions', async (t) => {
  const calls = [];
  const session = client(t, async (url, options) => {
    calls.push({ url, options });
    return json(calls.length === 1 ? signedIn() : { status: 'guest' });
  });
  assert.deepEqual(session.snapshot(), { status: 'unknown' });
  await session.refresh();
  const snapshot = session.snapshot();
  assert.equal(snapshot.partition, partitionA);
  assert.equal(Object.hasOwn(snapshot, 'csrfToken'), false);
  assert.equal(Object.isFrozen(snapshot), true);
  const lease = session.lease();
  const logout = session.logout();
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.isCurrent(), false);
  assert.equal(session.snapshot().status, 'signing-out');
  await logout;
  assert.deepEqual(session.snapshot(), { status: 'guest' });
  assert.equal(calls[0].url, `${origin}/api/akeru/session`);
  assert.equal(calls[1].url, `${origin}/api/akeru/logout`);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.mode, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.referrerPolicy, 'no-referrer');
  }
  assert.equal(calls[0].options.headers['X-Akeru-CSRF'], undefined);
  assert.equal(calls[1].options.headers['X-Akeru-CSRF'], csrfToken);
});

test('late session read cannot restore an old account after a newer refresh', async (t) => {
  const older = deferred();
  let count = 0;
  const session = client(t, async () =>
    ++count === 1 ? older.promise : json(signedIn(partitionB)),
  );
  const first = session.refresh();
  const rejection = assert.rejects(first, { code: 'stale' });
  await session.refresh();
  older.resolve(json(signedIn(partitionA)));
  await rejection;
  assert.equal(session.snapshot().partition, partitionB);
});

test('even same-account refresh invalidates outstanding leases; guest and failure cannot borrow identity', async (t) => {
  let payload = signedIn();
  const session = client(t, async () => json(payload));
  await session.refresh();
  const first = session.lease();
  await session.refresh();
  assert.equal(first.isCurrent(), false);
  assert.equal(first.signal.aborted, true);
  const second = session.lease();
  payload = { status: 'guest' };
  await session.refresh();
  assert.equal(second.isCurrent(), false);
  assert.throws(() => session.lease(), { code: 'unauthenticated' });
});

test('failed logout suspends account work without pretending server revocation succeeded', async (t) => {
  const pending = deferred();
  const session = client(t, async (_url, options) =>
    options.method === 'POST' ? pending.promise : json(signedIn()),
  );
  await session.refresh();
  const lease = session.lease();
  const logout = session.logout();
  await assert.rejects(session.refresh(), { code: 'busy' });
  assert.throws(() => session.lease(), { code: 'busy' });
  pending.resolve(new Response('private provider details', { status: 500 }));
  await assert.rejects(logout, {
    code: 'unavailable',
    message: 'Session unavailable.',
  });
  assert.equal(session.snapshot().status, 'unavailable');
  assert.equal(lease.isCurrent(), false);
  assert.throws(() => session.lease(), { code: 'unauthenticated' });
  await session.refresh();
  assert.equal(session.lease().isCurrent(), true);
  assert.equal(lease.isCurrent(), false);
});

test('expiry aborts account work, including when the clock advances without timer delivery', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const session = client(t, async () =>
    json(signedIn(partitionA, { expiresAt: Date.now() + 100 })),
  );
  await session.refresh();
  const lease = session.lease();
  t.mock.timers.tick(101);
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.isCurrent(), false);
  assert.equal(session.snapshot().status, 'expired');
  assert.throws(() => session.lease(), { code: 'unauthenticated' });
});

test('dispose invalidates leases and outstanding responses without reopening session', async (t) => {
  const pending = deferred();
  let count = 0;
  const session = client(t, async () =>
    ++count === 1 ? json(signedIn()) : pending.promise,
  );
  await session.refresh();
  const lease = session.lease();
  const refresh = session.refresh();
  const rejection = assert.rejects(refresh, { code: 'stale' });
  session.dispose();
  pending.resolve(json(signedIn()));
  await rejection;
  assert.equal(lease.isCurrent(), false);
  assert.equal(session.snapshot().status, 'disposed');
  await assert.rejects(session.refresh(), { code: 'disposed' });
});

test('malformed, expired, oversized and broad-token session responses fail closed', async (t) => {
  const invalid = [
    null,
    [],
    { status: 'guest', accessToken: 'secret' },
    signedIn(partitionA, { accessToken: 'secret' }),
    signedIn('user-id'),
    signedIn(partitionA, { csrfToken: '' }),
    signedIn(partitionA, { expiresAt: Date.now() - 1 }),
    signedIn(partitionA, { expiresAt: 'tomorrow' }),
    { status: 'guest', padding: 'x'.repeat(5000) },
  ];
  for (const payload of invalid) {
    const session = client(t, async () => json(payload));
    await assert.rejects(session.refresh(), {
      code: 'unavailable',
      message: 'Session unavailable.',
    });
    assert.equal(session.snapshot().status, 'unavailable');
    assert.throws(() => session.lease(), { code: 'unauthenticated' });
  }
});

test('stream limit cancels the response before unbounded buffering', async (t) => {
  let canceled = false;
  const session = client(
    t,
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(4097));
          },
          cancel() {
            canceled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  await assert.rejects(session.refresh(), { code: 'unavailable' });
  assert.equal(canceled, true);
});

test('transport errors and timeout reveal no provider details', async (t) => {
  const session = client(t, async () => {
    throw new Error('private-access-token');
  });
  await assert.rejects(session.refresh(), { message: 'Session unavailable.' });
  const timeout = client(
    t,
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(new Error('timeout-provider-detail')),
          { once: true },
        );
      }),
    { timeoutMs: 5 },
  );
  await assert.rejects(timeout.refresh(), { code: 'unavailable' });
});

test('invalid origin or timeout cannot configure credential transport', () => {
  for (const value of [
    'http://shell.invalid',
    'https://shell.invalid/',
    'https://user:secret@shell.invalid',
    'https://shell.invalid/path',
    'not a url',
  ]) {
    assert.throws(() => createSessionClient({ origin: value }), {
      code: 'invalid',
    });
  }
  assert.throws(() => createSessionClient({ origin, timeoutMs: Infinity }), {
    code: 'invalid',
  });
});
