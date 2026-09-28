import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from '@colyseus/sdk';
import {
  KART_BUILD,
  ROOM_NAME,
} from '../packages/old-san-juan-kart/multiplayer/protocol.js';
const fixture = new URL('./fixtures/kart-worker.mjs', import.meta.url);
async function availablePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
async function worker() {
  const port = await availablePort();
  const child = fork(fixture, [], {
    env: { ...process.env, KART_TEST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = '';
  child.stderr.on('data', (data) => (log += data));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Worker startup timed out: ' + log)),
      10000,
    );
    child.once('message', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(Error(log));
    });
  });
  return { port, child };
}
test(
  'Redis workers route a private invite to its owning process',
  { skip: !process.env.KART_TEST_REDIS_URL, timeout: 25000 },
  async () => {
    const workers = [],
      rooms = [];
    try {
      workers.push(await worker(), await worker());
      const clients = workers.map(
        (w) => new Client(`http://127.0.0.1:${w.port}`),
      );
      const a = await clients[0].create(ROOM_NAME, { build: KART_BUILD });
      rooms.push(a);
      a.onMessage('snapshot', () => {});
      const b = await clients[1].joinById(a.roomId, { build: KART_BUILD });
      rooms.push(b);
      const state = await new Promise((resolve) =>
        b.onMessage('snapshot', resolve),
      );
      assert.equal(a.roomId, b.roomId);
      assert.equal(state.players.length, 2);
      assert.equal(
        new URL(a.connection.url).port,
        new URL(b.connection.url).port,
      );
    } finally {
      await Promise.allSettled(
        rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
      );
      for (const w of workers) w.child.send('stop');
      await Promise.all(
        workers.map(
          (w) =>
            new Promise((r) => {
              w.child.once('exit', r);
              setTimeout(() => {
                w.child.kill('SIGKILL');
                r();
              }, 4000).unref();
            }),
        ),
      );
    }
  },
);
