import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import {
  parseOrigins,
  allowUpgrade,
  takeControlToken,
} from '../packages/mythic-kitchen/server/policy.mjs';

test('Kitchen cloud admission rejects unlisted/missing origins, routes and exhausted capacity', () => {
  assert.throws(() => parseOrigins(''));
  assert.throws(() => parseOrigins('https://game.example/path'));
  const origins = parseOrigins('https://game.example');
  const req = {
    method: 'GET',
    url: '/ws',
    headers: { origin: 'https://game.example' },
  };
  assert.equal(allowUpgrade(req, origins, 0), true);
  assert.equal(allowUpgrade({ ...req, headers: {} }, origins, 0), false);
  assert.equal(
    allowUpgrade(
      { ...req, headers: { origin: 'https://evil.example' } },
      origins,
      0,
    ),
    false,
  );
  assert.equal(allowUpgrade({ ...req, url: '/other' }, origins, 0), false);
  assert.equal(allowUpgrade(req, origins, 64), false);
  const socket = { controlTokens: 2, controlAt: 0 };
  assert.equal(takeControlToken(socket, 0), true);
  assert.equal(takeControlToken(socket, 0), true);
  assert.equal(takeControlToken(socket, 0), false);
  assert.equal(takeControlToken(socket, 1000), true);
});

const runtime = new URL(
  '../dist/mythic-kitchen-server/server/index.js',
  import.meta.url,
);
test(
  'Kitchen authoritative cloud runtime: independent guests join, ready, move and release stale input',
  { skip: !existsSync(runtime), timeout: 25000 },
  async () => {
    const child = spawn(process.execPath, [runtime.pathname], {
      env: { ...process.env, PORT: '0', TITLE_ORIGINS: 'https://game.example' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const clients = [];
    try {
      const port = await new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => reject(new Error('Server boot timeout')),
          5000,
        );
        child.stdout.on('data', (data) => {
          output += data;
          const match = output.match(/localhost:(\d+)/);
          if (match) {
            clearTimeout(timer);
            resolve(Number(match[1]));
          }
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Server exited ${code}`));
        });
        child.stderr.on('data', () => {});
      });
      const url = `ws://127.0.0.1:${port}/ws`;
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/health`)).status,
        200,
      );
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/server/index.js`)).status,
        404,
      );
      await new Promise((resolve, reject) => {
        const bad = new WebSocket(url, { origin: 'https://evil.example' });
        bad.once('open', () => {
          bad.terminate();
          reject(new Error('Unlisted origin admitted'));
        });
        bad.once('error', (error) => {
          assert.match(error.message, /403/);
          resolve();
        });
      });
      const connect = async () => {
        const ws = new WebSocket(url, { origin: 'https://game.example' });
        clients.push(ws);
        const history = [];
        ws.on('message', (raw) => history.push(JSON.parse(raw)));
        await new Promise((resolve, reject) => {
          ws.once('open', resolve);
          ws.once('error', reject);
        });
        return {
          ws,
          history,
          send: (value) => ws.send(JSON.stringify(value)),
          wait: (predicate) =>
            new Promise((resolve, reject) => {
              const until = Date.now() + 6000;
              const timer = setInterval(() => {
                const value = history.find(predicate);
                if (value) {
                  clearInterval(timer);
                  resolve(value);
                } else if (Date.now() > until) {
                  clearInterval(timer);
                  reject(new Error('Missing protocol event'));
                }
              }, 20);
            }),
        };
      };
      const a = await connect(),
        b = await connect();
      a.send({ t: 'create', name: 'Host' });
      const joinedA = await a.wait((m) => m.t === 'joined');
      b.send({ t: 'join', code: joinedA.code, name: 'Guest' });
      const joinedB = await b.wait((m) => m.t === 'joined');
      b.send({ t: 'start' });
      await b.wait((m) => m.t === 'error' && m.code === 'NOT_HOST');
      a.send({ t: 'lobby_update', ready: true });
      b.send({ t: 'lobby_update', ready: true });
      await a.wait(
        (m) =>
          m.t === 'lobby' &&
          m.lobby.players.length === 2 &&
          m.lobby.players.every((p) => p.ready),
      );
      a.send({ t: 'start' });
      await b.wait((m) => m.t === 'game_start');
      const first = await a.wait(
        (m) => m.t === 'snapshot' && m.state.phase === 'playing',
      );
      const player = (snapshot) =>
        snapshot.state.players.find((p) => p.id === joinedB.playerId);
      const initial = player(first);
      let seq = 0;
      const input = setInterval(
        () => b.send({ t: 'input', seq: ++seq, input: { mx: 1, my: 0 } }),
        17,
      );
      await new Promise((resolve) => setTimeout(resolve, 700));
      clearInterval(input);
      const moving = await a.wait(
        (m) =>
          m.t === 'snapshot' &&
          m.state.tick > first.state.tick + 20 &&
          Math.hypot(player(m).x - initial.x, player(m).y - initial.y) > 0.1,
      );
      const peer = await b.wait(
        (m) => m.t === 'snapshot' && m.state.tick === moving.state.tick,
      );
      assert.deepEqual(player(peer), player(moving));
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stopped = a.history.filter((m) => m.t === 'snapshot').at(-1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const still = a.history.filter((m) => m.t === 'snapshot').at(-1);
      assert.equal(player(still).x, player(stopped).x);
      assert.equal(player(still).y, player(stopped).y);
      a.send({ t: 'constructor' });
      await a.wait((m) => m.t === 'error' && m.code === 'BAD_MSG');
      a.ws.close();
      await b.wait(
        (m) => m.t === 'lobby' && m.lobby.hostId === joinedB.playerId,
      );
    } finally {
      clients.forEach((ws) => ws.terminate());
      child.kill('SIGTERM');
    }
  },
);
