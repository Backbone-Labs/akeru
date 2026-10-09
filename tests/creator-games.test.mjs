import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import assert from 'node:assert/strict';
import {
  createStorage,
  validStorage,
} from '../packages/creator-preview/storage.js';
import { input as manorInput } from '../packages/westwick-manor/src/input.js';
import {
  input as kitchenInput,
  idle as kitchenIdle,
} from '../packages/mythic-kitchen/src/input.js';
import {
  DEFAULT_MAPPINGS,
  normalizeRawControls,
} from '../packages/input/src/normalize.js';
import { createLocalNetwork } from '../packages/creator-preview/local-network.mjs';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { creatorTitles } from '../packages/creator-preview/titles.mjs';
import { validateMetadata } from '../platform/catalog/model.js';

test('creator storage isolates allowed keys and rejects corrupt/oversize state without clearing it', () => {
  let writes = 0;
  const s = createStorage(['progress'], () => writes++);
  s.hydrate({ progress: 'saved' });
  for (const bad of [
    [],
    { progress: 1 },
    { anotherTitle: 'secret' },
    { progress: 'x'.repeat(131073) },
    JSON.parse('{"__proto__":"bad"}'),
  ]) {
    assert.equal(Boolean(validStorage(bad, ['progress'])), false);
    assert.throws(() => s.hydrate(bad));
    assert.equal(s.getItem('progress'), 'saved');
  }
  assert.throws(() => s.setItem('anotherTitle', 'bad'));
  assert.throws(() => s.setItem('progress', 'x'.repeat(131073)));
  s.setItem('progress', 'updated');
  s.setItem('progress', 'updated');
  assert.equal(writes, 1);
  assert.deepEqual(s.serialize(), { progress: 'updated' });
  s.removeItem('anotherTitle');
  assert.equal(writes, 1);
  s.removeItem('progress');
  assert.equal(writes, 2);
});
test('standard controller exposes combat and kitchen actions without losing menu or movement mappings', () => {
  const controls = normalizeRawControls(
    {
      buttons: {
        south: 1,
        west: 1,
        north: 1,
        rightTrigger: 0.9,
        leftTrigger: 0.8,
        leftShoulder: 1,
        rightShoulder: 1,
        select: 1,
        start: 1,
      },
      axes: { leftX: 0.8, rightY: -1 },
    },
    DEFAULT_MAPPINGS.gamepad,
    0.15,
  );
  assert.equal(controls.buttons.confirm, 1);
  assert.equal(controls.buttons.menu, 1);
  assert.equal(controls.buttons.west, 1);
  assert.equal(controls.buttons.north, 1);
  assert.equal(controls.buttons.view, 1);
  assert.equal(controls.buttons.rightTrigger, 0.9);
  assert(controls.axes.moveX > 0.7);
  assert.equal(controls.axes.lookY, -1);
});
test('Manor maps two sticks, combat, interaction and item actions to simulation input', () => {
  const game = { me: () => ({ x: 10, y: 20 }) };
  const got = manorInput(
    { mx: 0, my: 0, aimX: 0, aimY: 0, slot: null },
    {
      axes: { moveX: 1, moveY: 1, lookX: -1, lookY: 0 },
      buttons: {
        rightTrigger: 1,
        leftTrigger: 1,
        confirm: 1,
        cancel: 1,
        north: 1,
      },
    },
    game,
  );
  assert(Math.abs(Math.hypot(got.mx, got.my) - 1) < 1e-9);
  assert.equal(got.aimX, 2);
  assert.equal(got.aimY, 20);
  for (const key of ['attack', 'ability', 'dash', 'interact', 'use', 'ready'])
    assert.equal(got[key], true);
  const heldAim = manorInput({ mx: 0, my: 0 }, { axes: {}, buttons: {} }, game);
  assert.equal(heldAim.aimX, 2);
});
test('Kitchen preserves keyboard player two and maps analog movement and held work independently', () => {
  assert.deepEqual(kitchenInput({ ...kitchenIdle, mx: -1 }, {}), {
    ...kitchenIdle,
    mx: -1,
  });
  const controls = kitchenInput(kitchenIdle, {
    buttons: { confirm: 1, west: 1, cancel: 1 },
    axes: { moveX: 0.5, moveY: -0.3 },
  });
  assert.equal(controls.mx, 0.5);
  assert.equal(controls.my, -0.3);
  assert.equal(controls.interact, true);
  assert.equal(controls.action, true);
  assert.equal(controls.dash, true);
});
test('local lobby proxy rejects other paths and origins without opening an upstream connection', () => {
  for (const bad of [0, 80, 65536, 1.5, NaN, '3000'])
    assert.throws(() => createLocalNetwork(bad));
  const proxy = createLocalNetwork(3002);
  for (const req of [
    {
      method: 'GET',
      url: '/ws',
      headers: { host: '127.0.0.1:10000', origin: 'https://foreign.invalid' },
    },
    {
      method: 'GET',
      url: '/private',
      headers: { host: '127.0.0.1:10000', origin: 'http://127.0.0.1:10000' },
    },
  ]) {
    let result = '';
    proxy(
      req,
      {
        end: (value) => {
          result = value;
        },
      },
      Buffer.alloc(0),
    );
    assert.match(result, /403 Forbidden/);
  }
});
test('creator build refuses a different source revision before packaging or executing source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'akeru-creator-pin-'));
  try {
    execFileSync('git', ['init', dir], { stdio: 'ignore' });
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'fixture',
      ],
      { stdio: 'ignore' },
    );
    for (const id of ['westwick-manor', 'mythic-kitchen']) {
      const r = spawnSync(process.execPath, [`packages/${id}/build.mjs`, dir], {
        encoding: 'utf8',
      });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Unexpected creator source revision/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test(
  'built creator titles retain independent origins and mandatory publication blocks',
  {
    skip: !existsSync(
      new URL('../dist/westwick-manor/build-record.json', import.meta.url),
    ),
  },
  () => {
    for (const title of creatorTitles()) {
      validateMetadata(title.metadata);
      assert.match(title.publicationBlocked, /Private creator/);
      assert.equal(title.manifest.saves.accountSync, 'disabled');
      assert.equal(title.manifest.provenance.source.rightsStatus, 'unknown');
      for (const [name, bytes] of Object.entries(title.titleFiles))
        if (name.endsWith('.js') && !name.startsWith('three--')) {
          assert.doesNotMatch(
            bytes.toString(),
            /\blocalStorage\b|\bnavigator\.getGamepads\b/,
          );
        }
      const text = readFileSync(
        new URL('../scripts/package-public-preview.mjs', import.meta.url),
        'utf8',
      );
      assert.match(text, /title\.publicationBlocked/);
    }
  },
);

// Exercise the same origin admission used by the bounded Kitchen runtime.
test('local lobby proxy supplies its fixed loopback origin to the server', async () => {
  const upstream = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const port = upstream.address().port;
  upstream.on('upgrade', (req, socket, head) => {
    if (req.headers.origin !== `http://127.0.0.1:${port}`) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (peer) => peer.send('admitted'));
  });
  const shell = createServer();
  shell.on('upgrade', createLocalNetwork(port));
  shell.listen(0, '127.0.0.1');
  await once(shell, 'listening');
  const origin = `http://127.0.0.1:${shell.address().port}`;
  const client = new WebSocket(origin.replace('http:', 'ws:') + '/ws', {
    origin,
  });
  try {
    const [message] = await once(client, 'message');
    assert.equal(message.toString(), 'admitted');
  } finally {
    client.terminate();
    for (const peer of sockets.clients) peer.terminate();
    await Promise.all([
      new Promise((resolve) => sockets.close(resolve)),
      new Promise((resolve) => shell.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});
