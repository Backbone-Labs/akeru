// Dead End Dash's party relay as an Akeru-run service: who is admitted, what
// the recipe will and will not build, and what the built runtime does. The
// game's own repository tests the relay's rooms and limits; these tests cover
// what this package adds around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  admit,
  limits,
  parseOrigins,
} from '../packages/dead-end-dash/server/policy.mjs';
import {
  buildDeadEndDashServer,
  checkRelaySource,
} from '../packages/dead-end-dash/build-server.mjs';
import {
  revision,
  serverDigest,
  sourceUrl,
} from '../packages/dead-end-dash/pinned.mjs';
import {
  fixture,
  fixtureUrl,
  lockedWs,
  run,
} from './fixtures/dead-end-dash-checkout.mjs';

const ORIGIN = 'https://title.example';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort();

// ------------------------------------------------------------------ admission

test('TITLE_ORIGINS must name exact secure origins, and without it nothing starts', () => {
  for (const bad of [
    undefined,
    null,
    '',
    ',',
    '*',
    'title.example',
    'https://title.example/',
    'https://title.example/play',
    'https://*.title.example',
    'http://title.example',
    'http://localhost:4174',
    'ws://title.example',
    'https://title.example, https://other.example',
    'https://TITLE.example',
    'https://title.example:443',
  ])
    assert.throws(
      () => parseOrigins(bad),
      /TITLE_ORIGINS is required|Expected exact HTTPS title origins/,
      String(bad),
    );
  assert.deepEqual(
    [...parseOrigins('https://title.example,http://127.0.0.1:4174')],
    ['https://title.example', 'http://127.0.0.1:4174'],
  );
  assert.deepEqual(
    [...parseOrigins('https://a.example,,https://a.example')],
    ['https://a.example'],
  );
});

test('only a GET to /ws from a listed origin is admitted', () => {
  const origins = parseOrigins(ORIGIN);
  const req = { method: 'GET', url: '/ws', headers: { origin: ORIGIN } };
  assert.equal(admit(req, origins), true);
  for (const [why, change] of [
    ['no Origin: not a browser page', { headers: {} }],
    ['another site', { headers: { origin: 'https://elsewhere.example' } }],
    ['a look-alike', { headers: { origin: ORIGIN + '.elsewhere.example' } }],
    ['plain HTTP', { headers: { origin: 'http://title.example' } }],
    ['another port', { headers: { origin: ORIGIN + ':8443' } }],
    ['a sandboxed page', { headers: { origin: 'null' } }],
    ['two Origin headers', { headers: { origin: [ORIGIN, ORIGIN] } }],
    ['another method', { method: 'POST' }],
    ['the standalone game’s path', { url: '/relay' }],
    ['a query', { url: '/ws?code=ABCDEF' }],
    ['a longer path', { url: '/ws/' }],
    ['the health check', { url: '/health' }],
    ['the root', { url: '/' }],
  ])
    assert.equal(admit({ ...req, ...change }, origins), false, why);
  // What one instance carries, and nothing a caller can change at run time.
  assert.deepEqual(limits, {
    maxSockets: 256,
    maxRooms: 128,
    acceptPerSecond: 20,
  });
  assert.ok(Object.isFrozen(limits));
});

// --------------------------------------------------------------- the recipe

test('the relay source is one module that imports ws and reaches for nothing else', async () => {
  const good =
    "// process, require and import('x') in a comment are only words\n" +
    "import { WebSocketServer } from 'ws';\n" +
    'export const createRelay = () => new WebSocketServer({ noServer: true });\n';
  assert.equal(await checkRelaySource(good), good);
  for (const [extra, pattern] of [
    ["import fs from 'node:fs';", /other than ws: ws, node:fs/],
    ["import './relay.mjs';", /other than ws: ws, \.\/relay\.mjs/],
    ["import('ws');", /other than ws: ws, ws/],
    ["export * from 'node:child_process';", /other than ws/],
    ['const name = "ws"; import(name);', /reaches outside itself: import\(/],
    [
      'export const port = process.env.PORT;',
      /reaches outside itself: process/,
    ],
    ['const load = require;', /reaches outside itself: require/],
    ['export const g = globalThis;', /reaches outside itself: globalThis/],
    ['eval("1");', /reaches outside itself: eval/],
    ['new Function("return 1");', /reaches outside itself: Function/],
  ])
    await assert.rejects(checkRelaySource(good + extra + '\n'), pattern, extra);
  await assert.rejects(
    checkRelaySource('export const createRelay = () => null;\n'),
    /other than ws: $/,
  );
  await assert.rejects(checkRelaySource('this is not a module {'));
});

test('the recipe builds a runtime of the pinned relay, this package’s entry and the locked ws, and records every file', async () => {
  const f = fixture();
  try {
    const first = await buildDeadEndDashServer(f.dir, f.outUrl, f.pin);
    assert.equal(first.version, '9.9.9');
    assert.deepEqual(first.files, [
      'Dockerfile',
      'index.mjs',
      'package.json',
      'policy.mjs',
      'relay-core.mjs',
      'runtime-evidence.json',
    ]);
    const evidence = JSON.parse(
      readFileSync(join(f.out, 'runtime-evidence.json'), 'utf8'),
    );
    assert.equal(evidence.revision, f.pin.revision);
    assert.equal(evidence.sourceUrl, fixtureUrl);
    assert.equal(evidence.sourceDigest, first.serverDigest);
    // Two files of the game are read, and neither is the title's.
    assert.deepEqual(
      evidence.source.map((s) => s.path),
      ['package.json', 'server/relay-core.mjs'],
    );
    assert.equal(evidence.dependency.version, lockedWs);
    assert.match(evidence.dependency.integrity, /^sha512-/);
    assert.match(evidence.approval, /nothing was deployed/);
    // The record lists exactly what is there, and each hash is right.
    assert.deepEqual(
      evidence.files.map((file) => file.path),
      filesUnder(f.out).filter((path) => path !== 'runtime-evidence.json'),
    );
    for (const { path, sha256: recorded } of evidence.files)
      assert.equal(sha256(readFileSync(join(f.out, path))), recorded, path);
    // The relay is the committed file; the entry and policy are this
    // package's; the WebSocket package arrives whole, licence included.
    assert.equal(
      readFileSync(join(f.out, 'relay-core.mjs'), 'utf8'),
      run(f.dir, 'show', 'HEAD:server/relay-core.mjs') + '\n',
    );
    for (const name of ['index.mjs', 'policy.mjs'])
      assert.equal(
        readFileSync(join(f.out, name), 'utf8'),
        readFileSync(
          new URL('../packages/dead-end-dash/server/' + name, import.meta.url),
          'utf8',
        ),
      );
    assert.ok(existsSync(join(f.out, 'node_modules/ws/LICENSE')));
    assert.deepEqual(readdirSync(join(f.out, 'node_modules')), ['ws']);
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.out, 'package.json'), 'utf8')),
      {
        private: true,
        type: 'module',
        engines: { node: '24.21.0' },
        dependencies: { ws: lockedWs },
      },
    );
    // The container runs the entry as an unprivileged user from a pinned
    // base, and the recipe fetches nothing while building it.
    const dockerfile = readFileSync(join(f.out, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /^FROM node:24\.21\.0-slim\n/);
    assert.match(dockerfile, /\nUSER node\n/);
    assert.match(dockerfile, /\nCMD \["node", "index\.mjs"\]\n$/);
    assert.doesNotMatch(dockerfile, /\bRUN\b|\bADD\b|npm|curl|wget/);
    // Nothing of the title, the game's standalone server or this machine.
    assert.deepEqual(
      filesUnder(f.out).filter((path) => !path.startsWith('node_modules/ws/')),
      first.files,
    );
    for (const name of ['index.mjs', 'policy.mjs', 'runtime-evidence.json'])
      assert.doesNotMatch(
        readFileSync(join(f.out, name), 'utf8'),
        /akeru-ded-fixture|\/home\/|\/Users\/|\/tmp\//,
        name,
      );
    // The same commit gives the same digest, and the digest pins it.
    const again = await buildDeadEndDashServer(f.dir, f.outUrl, {
      ...f.pin,
      serverDigest: first.serverDigest,
    });
    assert.equal(again.serverDigest, first.serverDigest);
  } finally {
    f.done();
  }
});

test('the recipe refuses the wrong commit, repository, bytes or ws, and leaves the last good runtime alone', async () => {
  const f = fixture();
  try {
    const good = await buildDeadEndDashServer(f.dir, f.outUrl, f.pin);
    const before = readFileSync(join(f.out, 'runtime-evidence.json'), 'utf8');
    const refuse = (pin, pattern, dir = f.dir) =>
      assert.rejects(buildDeadEndDashServer(dir, f.outUrl, pin), pattern);
    await refuse(
      { ...f.pin, revision: 'a'.repeat(40) },
      /Unexpected Dead End Dash source revision/,
    );
    await refuse(
      { ...f.pin, sourceUrl: 'https://github.com/someone-else/dead-end-dash' },
      /not from the pinned repository/,
    );
    await refuse(
      { ...f.pin, serverDigest: 'b'.repeat(64) },
      /does not match its pinned digest/,
    );
    await refuse(f.pin, /Not a Dead End Dash checkout/, join(f.dir, 'missing'));
    await assert.rejects(
      buildDeadEndDashServer('', f.outUrl, f.pin),
      /Pass the path/,
    );
    // An edit that is not committed is not the pinned source, and is not read.
    const relay = join(f.dir, 'server/relay-core.mjs');
    const committed = readFileSync(relay, 'utf8');
    writeFileSync(relay, committed + '\nexport const edited = "dirty-tree";\n');
    const dirty = await buildDeadEndDashServer(f.dir, f.outUrl, {
      ...f.pin,
      serverDigest: good.serverDigest,
    });
    assert.equal(dirty.serverDigest, good.serverDigest);
    assert.equal(
      readFileSync(join(f.out, 'relay-core.mjs'), 'utf8'),
      committed,
    );
    assert.equal(
      readFileSync(join(f.out, 'runtime-evidence.json'), 'utf8'),
      before,
    );
  } finally {
    f.done();
  }
  for (const [change, pattern] of [
    [
      (files) =>
        (files['package.json'] =
          '{"version":"9.9.9","dependencies":{"ws":"8.0.0"}}'),
      /expects another ws than the root lockfile records/,
    ],
    [
      (files) => (files['package.json'] = '{"version":"9.9.9"}'),
      /expects another ws than the root lockfile records/,
    ],
    [
      (files) =>
        (files['package.json'] = JSON.stringify({
          version: '9.9.9',
          dependencies: { ws: '^' + lockedWs },
        })),
      /expects another ws than the root lockfile records/,
    ],
    [
      (files) =>
        (files['package.json'] = JSON.stringify({
          version: 'latest',
          dependencies: { ws: lockedWs },
        })),
      /Unexpected Dead End Dash version/,
    ],
    [
      (files) => delete files['server/relay-core.mjs'],
      /source file is missing: server\/relay-core\.mjs/,
    ],
    [
      (files) => (files['server/relay-core.mjs'] = { link: '/etc/hostname' }),
      /source file is missing: server\/relay-core\.mjs/,
    ],
    [
      (files) =>
        (files['server/relay-core.mjs'] =
          "import { readFileSync } from 'node:fs';\n" +
          files['server/relay-core.mjs']),
      /Relay source imports something other than ws/,
    ],
    [
      (files) =>
        (files['server/relay-core.mjs'] +=
          'export const secret = process.env.TITLE_ORIGINS;\n'),
      /Relay source reaches outside itself: process/,
    ],
  ]) {
    const f = fixture(change);
    try {
      await assert.rejects(
        buildDeadEndDashServer(f.dir, f.outUrl, f.pin),
        pattern,
      );
      assert.deepEqual(filesUnder(f.out), [], 'a refused build writes nothing');
    } finally {
      f.done();
    }
  }
  // The command line refuses the same way, before anything is read.
  const none = spawnSync(
    process.execPath,
    ['packages/dead-end-dash/build-server.mjs'],
    { encoding: 'utf8' },
  );
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /Pass the path to the Dead End Dash checkout/);
  const empty = mkdtempSync(join(tmpdir(), 'akeru-ded-pin-'));
  try {
    run(empty, 'init', '-q');
    run(empty, 'commit', '-q', '--allow-empty', '-m', 'fixture');
    const wrong = spawnSync(
      process.execPath,
      ['packages/dead-end-dash/build-server.mjs', empty],
      { encoding: 'utf8' },
    );
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /Unexpected Dead End Dash source revision/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- the runtime

/** Run a runtime directory's entry on a free loopback port, with nothing in
 * its environment but what the test gives it. */
async function start(dir, env = {}) {
  const child = spawn(process.execPath, [join(dir, 'index.mjs')], {
    env: {
      PATH: process.env.PATH,
      PORT: '0',
      HOST: '127.0.0.1',
      TITLE_ORIGINS: ORIGIN,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (data) => (output += data));
  // 'close', not 'exit': everything it printed has been read by then.
  const exited = once(child, 'close');
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Relay did not start: ' + output)),
      8000,
    );
    child.stdout.on('data', (data) => {
      output += data;
      // Both start-up lines, so that the second is there to be read.
      const match = /localhost:(\d+)\n/.exec(output);
      if (match) {
        clearTimeout(timer);
        setTimeout(() => resolve(Number(match[1])), 50);
      }
    });
    exited.then(([code]) => {
      clearTimeout(timer);
      reject(new Error(`Relay exited ${code}: ${output}`));
    });
  });
  return {
    port,
    output: () => output,
    http: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM');
      return (await exited)[0];
    },
  };
}

/** Try to open a WebSocket. Resolves with the HTTP status that refused it,
 * or with the open socket and everything it is sent. */
function knock(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const history = [];
    ws.on('message', (raw) => history.push(JSON.parse(raw)));
    ws.once('unexpected-response', (req, res) => {
      req.destroy();
      resolve({ status: res.statusCode });
    });
    ws.once('error', reject);
    ws.once('open', () =>
      resolve({
        status: 101,
        ws,
        history,
        send: (value) => ws.send(JSON.stringify(value)),
        wait: (predicate, what = 'message') =>
          new Promise((found, missing) => {
            const until = Date.now() + 5000;
            const timer = setInterval(() => {
              const value = history.find(predicate);
              if (value) {
                clearInterval(timer);
                found(value);
              } else if (Date.now() > until) {
                clearInterval(timer);
                missing(
                  new Error(`No ${what}; got ${JSON.stringify(history)}`),
                );
              }
            }, 10);
          }),
      }),
    );
  });
}
const status = async (url, init) => (await fetch(url, init)).status;

test('the entry serves a health check and one admitted WebSocket path, hands the relay this package’s limits, and stops cleanly', async () => {
  // The fixture's stand-in relay reports what it was created with. This runs
  // in public CI; the game's own relay is exercised by the test below.
  const f = fixture();
  let relay;
  const open = [];
  try {
    await buildDeadEndDashServer(f.dir, f.outUrl, f.pin);
    relay = await start(f.out);
    assert.match(relay.output(), /Per-address limits are off/);
    const health = await fetch(relay.http + '/health');
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    // No file is served: not the runtime's own, not the record, no listing.
    for (const path of [
      '/',
      '/index.mjs',
      '/policy.mjs',
      '/relay-core.mjs',
      '/runtime-evidence.json',
      '/package.json',
      '/node_modules/ws/package.json',
      '/health/',
      '/health?x=1',
      '/ws',
      '/..%2fpackage.json',
    ])
      assert.equal(await status(relay.http + path), 404, path);
    assert.equal(await status(relay.http + '/health', { method: 'POST' }), 404);

    for (const [why, path, options] of [
      ['another site', '/ws', { origin: 'https://elsewhere.example' }],
      ['no Origin at all', '/ws', {}],
      ['a look-alike', '/ws', { origin: ORIGIN + '.elsewhere.example' }],
      ['plain HTTP', '/ws', { origin: 'http://title.example' }],
      ['the standalone game’s path', '/relay', { origin: ORIGIN }],
      ['a query', '/ws?x=1', { origin: ORIGIN }],
      ['the health path', '/health', { origin: ORIGIN }],
      ['the root', '/', { origin: ORIGIN }],
    ])
      assert.equal((await knock(relay.ws + path, options)).status, 403, why);

    const guest = await knock(relay.ws + '/ws', { origin: ORIGIN });
    open.push(guest.ws);
    assert.equal(guest.status, 101);
    const told = await guest.wait((m) => m.fixture === 'relay');
    // The package's limits, and no per-address limits while nobody has said
    // where players' addresses are.
    assert.deepEqual(told.options, {
      maxSockets: 256,
      maxRooms: 128,
      acceptPerSecond: 20,
      probesPerMinute: 0,
      maxPerAddress: 0,
    });
    // SIGTERM: connections are told the server is restarting, and it exits.
    const closed = once(guest.ws, 'close');
    assert.equal(await relay.stop(), 0);
    assert.equal((await closed)[0], 1012);

    // Told where addresses are, the entry passes that on instead.
    relay = await start(f.out, { FORWARDED_HOPS: '1' });
    assert.doesNotMatch(relay.output(), /Per-address limits are off/);
    const second = await knock(relay.ws + '/ws', { origin: ORIGIN });
    open.push(second.ws);
    assert.deepEqual(
      (await second.wait((m) => m.fixture === 'relay')).options,
      { maxSockets: 256, maxRooms: 128, acceptPerSecond: 20, hops: 1 },
    );
    await relay.stop();

    // Without a usable TITLE_ORIGINS it does not start at all.
    for (const origins of ['', '*', 'http://title.example', ORIGIN + '/'])
      await assert.rejects(
        start(f.out, { TITLE_ORIGINS: origins }),
        /Relay exited 1: [^]*(TITLE_ORIGINS is required|Expected exact HTTPS title origins)/,
        origins,
      );
  } finally {
    for (const ws of open) ws.terminate();
    await relay?.stop();
    f.done();
  }
});

const runtime = fileURLToPath(
  new URL('../dist/dead-end-dash-server/', import.meta.url),
);
const builtRuntime = existsSync(join(runtime, 'index.mjs'));
// What the game's client sends: a public id, and a key only the relay sees.
const keyOf = (id) => (id + '-').repeat(4).slice(0, 26);
const hello = (code, id, flags = {}) => ({
  t: 'hello',
  v: 1,
  id,
  key: keyOf(id),
  code,
  create: false,
  rejoin: false,
  ...flags,
});

test(
  'the real runtime is the pinned relay behind this package’s current entry',
  { skip: !builtRuntime },
  () => {
    const evidence = JSON.parse(
      readFileSync(join(runtime, 'runtime-evidence.json'), 'utf8'),
    );
    assert.equal(evidence.revision, revision);
    assert.equal(evidence.sourceUrl, sourceUrl);
    assert.equal(evidence.sourceDigest, serverDigest);
    assert.deepEqual(
      evidence.files.map((file) => file.path),
      filesUnder(runtime).filter((path) => path !== 'runtime-evidence.json'),
    );
    for (const { path, sha256: recorded } of evidence.files)
      assert.equal(sha256(readFileSync(join(runtime, path))), recorded, path);
    // A runtime built before the entry or policy last changed is not what
    // these tests are about: rebuild it.
    for (const name of ['index.mjs', 'policy.mjs'])
      assert.equal(
        readFileSync(join(runtime, name), 'utf8'),
        readFileSync(
          new URL('../packages/dead-end-dash/server/' + name, import.meta.url),
          'utf8',
        ),
        name + ' is stale: run build-server.mjs again',
      );
  },
);

test(
  'the real runtime: guests from the title’s origin form a party, a stranger learns only that a code is not theirs, and a restart is survivable',
  { skip: !builtRuntime, timeout: 30000 },
  async () => {
    let relay = await start(runtime);
    const open = [];
    const enter = async (options = { origin: ORIGIN }) => {
      const peer = await knock(relay.ws + '/ws', options);
      if (peer.ws) open.push(peer.ws);
      return peer;
    };
    try {
      assert.equal(await status(relay.http + '/health'), 200);
      for (const path of ['/', '/index.html', '/game.js', '/relay-core.mjs'])
        assert.equal(await status(relay.http + path), 404, path);
      assert.equal(
        (await enter({ origin: 'https://elsewhere.example' })).status,
        403,
      );
      assert.equal((await enter({})).status, 403);

      const host = await enter();
      host.send(hello('AKERUX', 'phostaaa', { create: true }));
      assert.deepEqual(await host.wait((m) => m.t === 'welcome'), {
        t: 'welcome',
        code: 'AKERUX',
        peers: {},
      });
      host.send({ t: 'set', k: 'n', v: ['Host', 2] });
      await new Promise((r) => setTimeout(r, 50));
      const guest = await enter();
      guest.send(hello('akerux', 'pguestaa'));
      assert.deepEqual(await guest.wait((m) => m.t === 'welcome'), {
        t: 'welcome',
        code: 'AKERUX',
        peers: { phostaaa: { n: ['Host', 2] } },
      });
      await host.wait((m) => m.t === 'join' && m.id === 'pguestaa');
      guest.send({ t: 'set', k: 'm', v: [10, 20, 1, 0, 0, 7] });
      assert.deepEqual(await host.wait((m) => m.t === 'set' && m.k === 'm'), {
        t: 'set',
        id: 'pguestaa',
        k: 'm',
        v: [10, 20, 1, 0, 0, 7],
      });
      // A key the game does not use is not carried.
      guest.send({ t: 'set', k: 'x', v: 'anything' });
      guest.send({ t: 'set', k: 'm', v: [11, 20, 1, 0, 0, 7] });
      await host.wait((m) => m.t === 'set' && m.v?.[0] === 11);
      assert.equal(
        host.history.some((m) => m.k === 'x'),
        false,
      );

      // Someone without the code: each attempt gets one word and is closed.
      const wrong = await enter();
      const wrongClosed = once(wrong.ws, 'close');
      wrong.send(hello('NOSUCH', 'pstrange'));
      assert.deepEqual(await wrong.wait((m) => m.t === 'error'), {
        t: 'error',
        code: 'no-party',
      });
      await wrongClosed;
      const taken = await enter();
      taken.send(hello('AKERUX', 'pstrange', { create: true }));
      assert.deepEqual(await taken.wait((m) => m.t === 'error'), {
        t: 'error',
        code: 'code-taken',
      });
      // Someone in the party who knows another player's id, as every member
      // does, cannot take that player's seat: the key is not theirs.
      for (const key of [undefined, keyOf('pstrange'), 'x'.repeat(26)]) {
        const thief = await enter();
        thief.send(hello('AKERUX', 'pguestaa', { key }));
        assert.deepEqual(await thief.wait((m) => m.t === 'error'), {
          t: 'error',
          code: 'id-taken',
        });
      }
      assert.equal(guest.ws.readyState, WebSocket.OPEN);
      assert.equal(
        host.history.some((m) => m.t === 'leave'),
        false,
      );
      assert.doesNotMatch(JSON.stringify(host.history), /pguestaa-pguestaa/);
      // A message larger than the relay carries ends that connection only.
      const loud = await enter();
      loud.send(hello('AKERUX', 'ploudaaa'));
      await loud.wait((m) => m.t === 'welcome');
      const loudClosed = once(loud.ws, 'close');
      loud.send({ t: 'set', k: 'l', v: 'x'.repeat(9000) });
      await loudClosed;
      await host.wait((m) => m.t === 'leave' && m.id === 'ploudaaa');
      assert.equal(host.ws.readyState, WebSocket.OPEN);

      // A restart: both are told, and the party is theirs again afterwards,
      // because the players hold its state and the relay holds none.
      const closes = [once(host.ws, 'close'), once(guest.ws, 'close')];
      assert.equal(await relay.stop(), 0);
      for (const [code] of await Promise.all(closes)) assert.equal(code, 1012);
      relay = await start(runtime);
      const back = await enter();
      back.send(hello('AKERUX', 'phostaaa', { rejoin: true }));
      assert.deepEqual(await back.wait((m) => m.t === 'welcome'), {
        t: 'welcome',
        code: 'AKERUX',
        peers: {},
      });
      const also = await enter();
      also.send(hello('AKERUX', 'pguestaa', { rejoin: true }));
      await also.wait((m) => m.t === 'welcome');
      await back.wait((m) => m.t === 'join' && m.id === 'pguestaa');
    } finally {
      for (const ws of open) ws.terminate();
      await relay.stop();
    }
  },
);

test(
  'the real runtime seats a full house in one burst, as after a restart, and turns the next connection away',
  { skip: !builtRuntime, timeout: 30000 },
  async () => {
    const relay = await start(runtime);
    const open = [];
    try {
      // Every player reconnects in the same second after a restart, and
      // gives up after a few tries: nobody is made to queue behind the rate.
      const began = Date.now();
      const house = await Promise.all(
        Array.from({ length: limits.maxSockets }, () =>
          knock(relay.ws + '/ws', { origin: ORIGIN }),
        ),
      );
      for (const peer of house) if (peer.ws) open.push(peer.ws);
      assert.deepEqual(
        [...new Set(house.map((peer) => peer.status))],
        [101],
        'everyone is admitted',
      );
      assert.equal(
        (await knock(relay.ws + '/ws', { origin: ORIGIN })).status,
        503,
        'full is full',
      );
      // The health check still answers at capacity.
      assert.equal(await status(relay.http + '/health'), 200);
      // The burst is spent. Seats that free up are refilled at the rate and
      // no faster: of 120 arrivals in one moment, most are asked to return.
      for (const ws of open.splice(0, 120)) ws.terminate();
      await new Promise((r) => setTimeout(r, 100));
      const late = await Promise.all(
        Array.from({ length: 120 }, () =>
          knock(relay.ws + '/ws', { origin: ORIGIN }),
        ),
      );
      for (const peer of late) if (peer.ws) open.push(peer.ws);
      const earned =
        Math.ceil(((Date.now() - began) / 1000) * limits.acceptPerSecond) + 1;
      const admitted = late.filter((peer) => peer.status === 101).length;
      assert.ok(admitted >= 1, 'the rate is not zero');
      assert.ok(
        admitted <= earned,
        `${admitted} admitted where the rate had earned ${earned}`,
      );
      assert.deepEqual(
        [...new Set(late.map((peer) => peer.status))].sort(),
        admitted === 120 ? [101] : [101, 429],
      );
    } finally {
      for (const ws of open) ws.terminate();
      await relay.stop();
    }
  },
);

test(
  'the real runtime counts guesses per player only once it is told where a player’s address is',
  { skip: !builtRuntime, timeout: 30000 },
  async () => {
    const open = [];
    const guess = async (relay, code, address) => {
      const peer = await knock(relay.ws + '/ws', {
        origin: ORIGIN,
        headers: address ? { 'x-forwarded-for': address } : {},
      });
      open.push(peer.ws);
      peer.send(hello(code, 'pguesser'));
      return (await peer.wait((m) => m.t === 'error')).code;
    };
    const codes = (n) =>
      Array.from(
        { length: n },
        (_, i) => 'GUESS' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i],
      );
    // Not told: every connection looks like the proxy's, so nothing is
    // counted per address, and one person guessing cannot lock others out.
    let relay = await start(runtime);
    try {
      assert.match(relay.output(), /Per-address limits are off/);
      for (const code of codes(24))
        assert.equal(await guess(relay, code, '203.0.113.7'), 'no-party');
    } finally {
      for (const ws of open.splice(0)) ws.terminate();
      await relay.stop();
    }
    // Told there is one proxy: the address it reports is the one counted.
    relay = await start(runtime, { FORWARDED_HOPS: '1' });
    try {
      assert.doesNotMatch(relay.output(), /Per-address limits are off/);
      for (const code of codes(20))
        assert.equal(await guess(relay, code, '203.0.113.7'), 'no-party');
      assert.equal(await guess(relay, 'GUESSZ', '203.0.113.7'), 'busy');
      // An address typed in front of the proxy's own entry changes nothing.
      assert.equal(
        await guess(relay, 'GUESSZ', '198.51.100.9, 203.0.113.7'),
        'busy',
      );
      assert.equal(await guess(relay, 'GUESSZ', '198.51.100.9'), 'no-party');
    } finally {
      for (const ws of open.splice(0)) ws.terminate();
      await relay.stop();
    }
    await assert.rejects(
      start(runtime, { FORWARDED_HOPS: 'cloud' }),
      /Relay exited 1: [^]*FORWARDED_HOPS must be a whole number/,
    );
  },
);
