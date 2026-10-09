import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  active,
  help,
  readControls,
  toInput,
} from '../packages/slipface/src/controls.js';
import {
  MAX_BYTES,
  SLOT,
  createProgress,
  decodeProgress,
  encodeProgress,
} from '../packages/slipface/src/progress.js';
import { createPill, supported } from '../packages/slipface/src/pill.js';
import { build, revision } from '../packages/slipface/build.mjs';
import { parse } from 'parse5';
import { readBuiltTitle } from '../packages/anarch/artifacts.mjs';
import { creatorTitles } from '../packages/creator-preview/titles.mjs';
import { validateMetadata } from '../platform/catalog/model.js';

const deviceApi =
  /\bgetGamepads\b|\bindexedDB\b|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/;

// ---- controller ---------------------------------------------------------------------------

const input = (buttons = {}, axes = {}) =>
  toInput(readControls({ buttons, axes }));

test('Slipface controller: stick and D-pad steer, and nothing held is nothing pressed', () => {
  const idle = input();
  assert.equal(idle.steer, 0);
  for (const [name, value] of Object.entries(idle))
    if (name !== 'steer') assert.equal(value, false, name);
  assert.equal(input({}, { moveX: 0.4 }).steer, 0.4);
  assert.equal(input({}, { moveX: -1 }).steer, -1);
  // The D-pad is a hard carve, whatever the stick says.
  assert.equal(input({ left: 1 }, { moveX: 0.3 }).steer, -1);
  assert.equal(input({ right: 1 }).steer, 1);
});

test('Slipface controller: hop, tuck and brake match the standalone layout', () => {
  assert.equal(input({ confirm: 1 }).hop, true);
  assert.equal(input({ rightTrigger: 0.4 }).tuck, true);
  assert.equal(input({ rightTrigger: 0.2 }).tuck, false);
  assert.equal(input({ rightShoulder: 1 }).tuck, true);
  assert.equal(input({ down: 1 }).tuck, true);
  for (const name of ['cancel', 'west', 'leftShoulder', 'up'])
    assert.equal(input({ [name]: 1 }).brake, true, name);
  assert.equal(input({ leftTrigger: 0.4 }).brake, true);
  assert.equal(input({ leftTrigger: 0.2 }).brake, false);
  assert.equal(input({ north: 1 }).brake, false);
  // A half-pressed digital button is not a press.
  assert.equal(input({ confirm: 0.5 }).hop, false);
});

test('Slipface controller: View is the game’s pause, Menu is never the game’s', () => {
  assert.equal(input({ view: 1 }).pause, true);
  const menu = input({ menu: 1 });
  assert.equal(menu.pause, false);
  assert.deepEqual(menu, input());
  assert.equal(help.pause, 'VIEW');
});

test('Slipface controller: menus take the D-pad or a firm push of the stick', () => {
  const pushed = input({}, { moveX: 0.7, moveY: -0.7 });
  assert.equal(pushed.right, true);
  assert.equal(pushed.up, true);
  assert.equal(pushed.left, false);
  assert.equal(pushed.down, false);
  const nudged = input({}, { moveX: -0.5, moveY: 0.5 });
  assert.equal(nudged.left, false);
  assert.equal(nudged.down, false);
  assert.equal(input({}, { moveY: 0.7 }).down, true);
  assert.equal(input({ confirm: 1 }).confirm, true);
  assert.equal(input({ cancel: 1 }).back, true);
});

test('Slipface controller: malformed, foreign and out-of-range input is dropped or bounded', () => {
  for (const bad of [
    undefined,
    null,
    7,
    'input',
    [],
    { buttons: null, axes: 'x' },
    { buttons: [1, 1, 1], axes: [1] },
  ])
    assert.deepEqual(readControls(bad), { buttons: {}, axes: {} });
  const read = readControls({
    buttons: {
      confirm: 9,
      cancel: -3,
      west: NaN,
      north: '1',
      up: Infinity,
      menu: 1,
      secret: 1,
    },
    axes: { moveX: -9, moveY: NaN, lookX: 1, lookY: 1 },
  });
  assert.deepEqual(read, { buttons: { confirm: 1 }, axes: { moveX: -1 } });
  // Inherited names are not controls.
  const inherited = readControls({
    buttons: Object.create({ confirm: 1 }),
    axes: JSON.parse('{"__proto__":{"moveX":1}}'),
  });
  assert.deepEqual(inherited, { buttons: {}, axes: {} });
  assert.equal(active(readControls({ buttons: { confirm: 1 } })), true);
  assert.equal(active(readControls({ axes: { moveX: -0.8 } })), true);
  assert.equal(active(readControls({ axes: { moveX: 0.2 } })), false);
  assert.equal(active(readControls({})), false);
});

// ---- progress ------------------------------------------------------------------------------

// Stands in for the game's own validator: a save is good when it is {v: 1, ...}.
const readSave = (raw) => ({
  save: raw,
  status: raw?.v === 1 ? 'ok' : raw?.v > 1 ? 'newer' : 'repaired',
});
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
const record = (value, extra = {}) => ({
  schemaVersion: 1,
  bytes: bytes(value),
  revision: 'r1',
  ...extra,
});
function hostSlot(initial = null) {
  const slot = {
    calls: [],
    stored: initial,
    fail: null,
    writes: initial ? 1 : 0,
  };
  slot.service = {
    async read(name) {
      slot.calls.push(['read', name]);
      return slot.stored;
    },
    async write(name, value, expectedRevision) {
      slot.calls.push(['write', name, expectedRevision]);
      if (slot.fail)
        throw Object.assign(new Error('Save ' + slot.fail), {
          code: slot.fail,
        });
      if ((slot.stored?.revision ?? null) !== expectedRevision)
        throw Object.assign(new Error('Save conflict'), { code: 'conflict' });
      slot.stored = { ...value, revision: 'r' + ++slot.writes };
      return { revision: slot.stored.revision };
    },
  };
  return slot;
}
function progressOver(slot) {
  let blockedCalls = 0;
  const progress = createProgress({
    service: slot.service,
    readSave,
    onBlocked: () => blockedCalls++,
  });
  return { progress, blocked: () => blockedCalls };
}

test('Slipface progress decodes only a save the game reads back unchanged', () => {
  assert.deepEqual(decodeProgress(record({ v: 1, freeBest: 12 }), readSave), {
    v: 1,
    freeBest: 12,
  });
  const invalidUtf8 = new Uint8Array([0x7b, 0xff, 0x7d]);
  for (const bad of [
    null,
    undefined,
    {},
    record({ v: 1 }, { schemaVersion: 2 }),
    record({ v: 1 }, { bytes: [...bytes({ v: 1 })] }),
    record({ v: 1 }, { bytes: bytes({ v: 1 }).buffer }),
    record({ v: 1 }, { bytes: new Uint8Array(0) }),
    record({ v: 1 }, { bytes: new Uint8Array(MAX_BYTES + 1).fill(0x20) }),
    record({ v: 1 }, { bytes: invalidUtf8 }),
    record({ v: 1 }, { bytes: new TextEncoder().encode('{"v":1') }),
    record([{ v: 1 }]),
    record('v1'),
    record(null),
    // Damaged (the game would repair it) and newer (a later build wrote it).
    record({ v: 0 }),
    record({ best: 3 }),
    record({ v: 2 }),
  ])
    assert.throws(() => decodeProgress(bad, readSave));
  assert.throws(() => encodeProgress({ pad: 'x'.repeat(MAX_BYTES) }));
});

test('Slipface progress creates the slot once, then writes in order against the last revision', async () => {
  const slot = hostSlot();
  const { progress, blocked } = progressOver(slot);
  await progress.open();
  await progress.open();
  assert.equal(await progress.storage.load(), null);
  // Two saves issued together must not race each other into a conflict.
  const first = progress.storage.save({ v: 1, freeBest: 1 });
  const second = progress.storage.save({ v: 1, freeBest: 2 });
  await Promise.all([first, second]);
  assert.deepEqual(slot.calls, [
    ['read', SLOT],
    ['write', SLOT, null],
    ['write', SLOT, 'r1'],
  ]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(slot.stored.bytes)), {
    v: 1,
    freeBest: 2,
  });
  assert.equal(slot.stored.schemaVersion, 1);
  assert.equal(progress.blocked, false);
  assert.equal(blocked(), 0);
});

test('Slipface progress hydrates a stored save and continues from its revision', async () => {
  const slot = hostSlot(record({ v: 1, freeBest: 900 }, { revision: 'r7' }));
  const { progress } = progressOver(slot);
  await progress.open();
  assert.deepEqual(await progress.storage.load(), { v: 1, freeBest: 900 });
  await progress.storage.save({ v: 1, freeBest: 901 });
  assert.deepEqual(slot.calls.at(-1), ['write', SLOT, 'r7']);
});

test('Slipface progress never writes over a save it could not read', async () => {
  for (const stored of [
    record({ v: 1 }, { bytes: new TextEncoder().encode('not json') }),
    record({ v: 0, freeBest: 5 }),
    record({ v: 2, fromTheFuture: true }),
    record({ v: 1 }, { schemaVersion: 3 }),
    record({ v: 1 }, { revision: '' }),
    record({ v: 1 }, { revision: undefined }),
  ]) {
    const slot = hostSlot(stored);
    const { progress, blocked } = progressOver(slot);
    await progress.open();
    assert.equal(progress.blocked, true);
    assert.equal(blocked(), 1);
    await assert.rejects(progress.storage.load());
    await assert.rejects(progress.storage.save({ v: 1, freeBest: 1 }));
    await assert.rejects(progress.storage.save({ v: 1, freeBest: 2 }));
    assert.deepEqual(slot.calls, [['read', SLOT]]);
    assert.equal(slot.stored, stored);
    assert.equal(blocked(), 1);
  }
});

test('Slipface progress stops at a conflict, a refusal or an unreadable host', async () => {
  // Another session wrote first: its progress stands, and this one stops writing.
  const slot = hostSlot();
  const { progress, blocked } = progressOver(slot);
  await progress.open();
  await progress.storage.save({ v: 1, freeBest: 1 });
  await slot.service.write(SLOT, record({ v: 1, freeBest: 77 }), 'r1');
  const theirs = slot.stored;
  await assert.rejects(progress.storage.save({ v: 1, freeBest: 2 }), {
    code: 'conflict',
  });
  const writes = slot.calls.length;
  await assert.rejects(progress.storage.save({ v: 1, freeBest: 3 }));
  assert.equal(slot.calls.length, writes);
  assert.equal(slot.stored, theirs);
  assert.equal(blocked(), 1);

  for (const code of ['quota', 'unavailable', 'invalid']) {
    const failing = hostSlot();
    const over = progressOver(failing);
    await over.progress.open();
    failing.fail = code;
    await assert.rejects(over.progress.storage.save({ v: 1 }), { code });
    failing.fail = null;
    await assert.rejects(over.progress.storage.save({ v: 1 }));
    assert.equal(failing.stored, null);
    assert.equal(over.blocked(), 1);
  }

  const unreadable = createProgress({
    service: {
      read: async () => {
        throw new Error('Save unavailable');
      },
      write: async () => assert.fail('must not write'),
    },
    readSave,
  });
  await unreadable.open();
  assert.equal(unreadable.blocked, true);
  await assert.rejects(unreadable.storage.save({ v: 1 }));

  // A host that acknowledges a write without a revision cannot be written to again.
  const vague = createProgress({
    service: { read: async () => null, write: async () => ({}) },
    readSave,
  });
  await vague.open();
  await assert.rejects(vague.storage.save({ v: 1 }));
  assert.equal(vague.blocked, true);
});

// ---- pill ----------------------------------------------------------------------------------

function pillFixture({
  muted = false,
  audio = 'running',
  run = null,
  held = false,
  flush = async () => {},
} = {}) {
  const sent = [];
  const game = {
    muted,
    audio,
    run,
    restarts: 0,
    unlocks: 0,
    status() {
      return {
        audio: this.audio && { muted: this.muted, status: this.audio },
        run: this.run,
      };
    },
    setMuted(value) {
      this.muted = value;
    },
    unlockAudio() {
      this.unlocks++;
    },
    restart() {
      this.restarts++;
    },
  };
  const pill = createPill({
    game: () => game,
    send: (type, payload) => sent.push([type, payload]),
    flush,
    audioHeld: () => held,
    settle: async () => {},
  });
  const ask = async (action, id = sent.length + 1) => {
    await pill.receive({ id, action });
    return sent.at(-1)?.[1];
  };
  return { pill, game, sent, ask };
}

test('Slipface pill ignores what it does not offer', async () => {
  const f = pillFixture();
  assert.equal(f.pill.supported, supported);
  assert.equal(supported.length, 6);
  for (const bad of [
    null,
    {},
    { id: 1 },
    { id: 1, action: 'exit' },
    { id: '1', action: 'save' },
    { id: 1.5, action: 'save' },
    { action: 'audio' },
  ])
    await f.pill.receive(bad);
  assert.deepEqual(f.sent, []);
});

test('Slipface pill reports stored progress and no mid-run snapshot', async () => {
  let flushed = 0;
  const f = pillFixture({ flush: async () => void flushed++ });
  for (const action of ['save', 'save-status']) {
    const reply = await f.ask(action);
    assert.equal(reply.ok, true);
    assert.deepEqual(reply.state, { hasManualSave: false, savedAt: null });
    assert.match(reply.message, /run in progress is not saved/);
  }
  assert.equal(flushed, 2);
  const restore = await f.ask('restore');
  assert.equal(restore.ok, false);
  assert.deepEqual(restore.state, { hasManualSave: false, savedAt: null });
  assert.equal(f.sent.at(-1)[0], 'action-result');
  assert.equal(restore.id, 3);

  const failing = pillFixture({
    flush: async () => {
      throw new Error('Saving unavailable');
    },
  });
  const failed = await failing.ask('save');
  assert.equal(failed.ok, false);
  assert.match(failed.message, /Existing progress is preserved/);
});

test('Slipface pill answers one save action at a time', async () => {
  let release;
  const f = pillFixture({
    flush: () => new Promise((resolve) => (release = resolve)),
  });
  const first = f.pill.receive({ id: 1, action: 'save' });
  await f.pill.receive({ id: 2, action: 'restart' });
  assert.deepEqual(f.sent, [
    [
      'action-result',
      {
        id: 2,
        ok: false,
        message: 'An action is in progress. Try again.',
        state: {},
      },
    ],
  ]);
  // Status questions are never queued behind it.
  await f.pill.receive({ id: 3, action: 'audio-status' });
  assert.equal(f.sent.at(-1)[1].id, 3);
  release();
  await first;
  assert.equal(f.sent.at(-1)[1].id, 1);
  assert.equal(f.sent.at(-1)[1].ok, true);
});

test('Slipface pill restarts a run, and only a run', async () => {
  const f = pillFixture();
  const none = await f.ask('restart');
  assert.equal(none.ok, false);
  assert.equal(f.game.restarts, 0);
  f.game.run = { tick: 400 };
  const done = await f.ask('restart');
  assert.equal(done.ok, true);
  assert.equal(f.game.restarts, 1);
});

test('Slipface pill sound: off, on, waiting for a tap, held by the host, and absent', async () => {
  const f = pillFixture();
  assert.equal((await f.ask('audio-status')).state.audioState, 'on');
  assert.equal(f.game.muted, false);
  assert.equal((await f.ask('audio')).state.audioState, 'off');
  assert.equal(f.game.muted, true);
  assert.equal(f.game.unlocks, 0);
  assert.equal((await f.ask('audio')).state.audioState, 'on');
  assert.equal(f.game.muted, false);
  assert.equal(f.game.unlocks, 1);

  // Wanted, but the browser has not let it start: a state, not a failure.
  const waiting = pillFixture({ audio: 'suspended' });
  const status = await waiting.ask('audio-status');
  assert.equal(status.ok, true);
  assert.equal(status.state.audioState, 'blocked');
  // Toggling asks again instead of muting what nobody can hear.
  const asked = await waiting.ask('audio');
  assert.equal(waiting.game.muted, false);
  assert.equal(waiting.game.unlocks, 1);
  assert.equal(asked.state.audioState, 'blocked');
  assert.match(asked.message, /tap the game/);

  // Suspended only because the host paused it.
  const held = pillFixture({ audio: 'suspended', held: true });
  assert.equal((await held.ask('audio-status')).state.audioState, 'on');
  assert.equal((await held.ask('audio')).state.audioState, 'off');

  for (const audio of ['unavailable', null]) {
    const absent = pillFixture({ audio });
    const reply = await absent.ask('audio');
    assert.equal(reply.ok, true);
    assert.equal(reply.state.audioState, 'off');
    assert.match(reply.message, /not available/);
    assert.equal(absent.game.unlocks, 0);
  }
});

// ---- build recipe --------------------------------------------------------------------------

const game = {
  'src/game.js':
    "import { step } from './sim/sim.js';\nexport { readSave } from './persist/schema.js';\nexport const createGame = () => step;\n",
  'src/sim/sim.js':
    "import { rng } from './rng.js';\nimport { palette } from '../render/palette.js';\nexport const step = () => rng() + palette.length;\n",
  'src/sim/rng.js': 'export const rng = () => 4;\n',
  'src/render/palette.js': "export const palette = ['sand'];\n",
  'src/persist/schema.js':
    "export const readSave = (raw) => ({ save: raw, status: 'ok' });\n",
  // Present in the checkout, never reached from the entry.
  'src/main.js':
    "import { createGame } from './game.js';\nimport './standalone.js';\ncreateGame();\n",
  'src/standalone.js': 'export const pads = () => navigator.getGamepads();\n',
  'tools/build.mjs': "console.log('not part of the title');\n",
  'README.md': '# Fixture\n',
};
const gitIn =
  (dir) =>
  (...args) =>
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
function checkout(
  root,
  files,
  { origin = 'https://github.com/example/slipface' } = {},
) {
  const dir = mkdtempSync(join(root, 'source-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const git = gitIn(dir);
  git('init', '--quiet');
  git('add', '--all');
  git('commit', '--quiet', '-m', 'fixture');
  if (origin) git('remote', 'add', 'origin', origin);
  return { dir, git, head: git('rev-parse', 'HEAD') };
}
function withFixtures(run) {
  const root = mkdtempSync(join(tmpdir(), 'akeru-slipface-'));
  try {
    return run(root, pathToFileURL(join(root, 'out') + '/'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Slipface build command refuses a missing checkout and any other revision', () => {
  const none = spawnSync(process.execPath, ['packages/slipface/build.mjs'], {
    encoding: 'utf8',
  });
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /Pass the path to the Slipface checkout/);
  assert.match(revision, /^[a-f0-9]{40}$/);
  // The pin is stated once in prose; it must be the one the recipe enforces.
  assert.ok(
    readFileSync(
      new URL('../packages/slipface/README.md', import.meta.url),
      'utf8',
    ).includes('`' + revision + '`'),
  );
  withFixtures((root) => {
    const source = checkout(root, game);
    assert.notEqual(source.head, revision);
    const other = spawnSync(
      process.execPath,
      ['packages/slipface/build.mjs', source.dir],
      { encoding: 'utf8' },
    );
    assert.notEqual(other.status, 0);
    assert.match(other.stderr, /Unexpected Slipface source revision/);
  });
});

test('Slipface build packages only what the game entry reaches, from the commit', () =>
  withFixtures((root, out) => {
    const source = checkout(root, game, {
      origin: 'git@github.com:example/slipface.git',
    });
    // Untracked files in the working tree are not source.
    writeFileSync(join(source.dir, 'src/sim/extra.js'), 'export default 1;\n');
    const built = build({ source: source.dir, out, pin: source.head });
    assert.equal(built.revision, source.head);
    assert.equal(built.sourceUrl, 'https://github.com/example/slipface');
    assert.deepEqual(
      built.source.map((file) => file.path),
      [
        'src/game.js',
        'src/persist/schema.js',
        'src/render/palette.js',
        'src/sim/rng.js',
        'src/sim/sim.js',
      ],
    );
    const files = readBuiltTitle(out);
    const adapter = readdirSync(
      new URL('../packages/slipface/src/', import.meta.url),
    );
    assert.deepEqual(
      Object.keys(files).sort(),
      [
        ...adapter,
        'build-record.json',
        'game.js',
        'index.html',
        'persist--schema.js',
        'render--palette.js',
        'save-client.js',
        'sim--rng.js',
        'sim--sim.js',
      ].sort(),
    );
    assert.match(
      files['sim--sim.js'].toString(),
      /from "\.\/sim--rng\.js";\nimport \{ palette \} from "\.\/render--palette\.js"/,
    );
    assert.match(files['game.js'].toString(), /from "\.\/persist--schema\.js"/);
    // The adapter is copied as reviewed, byte for byte.
    for (const name of adapter)
      assert.deepEqual(
        files[name],
        readFileSync(
          new URL('../packages/slipface/src/' + name, import.meta.url),
        ),
      );
    // The page is parsed rather than pattern-matched: one external module
    // script, no inline script or style, no event handlers, and every
    // reference is a packaged file beside it.
    const elements = [];
    const walk = (node) => {
      if (node.tagName) elements.push(node);
      for (const child of node.childNodes ?? []) walk(child);
    };
    walk(parse(files['index.html'].toString()));
    const attribute = (element, name) =>
      element.attrs.find((a) => a.name === name)?.value;
    const named = (tag) => elements.filter((el) => el.tagName === tag);
    assert.equal(named('style').length, 0);
    const [script, ...others] = named('script');
    assert.deepEqual(others, []);
    assert.equal(attribute(script, 'type'), 'module');
    assert.equal(attribute(script, 'src'), './title.js');
    assert.deepEqual(script.childNodes, []);
    for (const element of elements)
      for (const { name, value } of element.attrs) {
        assert.notEqual(name, 'style');
        assert.equal(name.startsWith('on'), false, name);
        if (name === 'href' || name === 'src') {
          assert.match(value, /^\.\/[a-zA-Z0-9._-]+$/);
          assert.ok(Object.hasOwn(files, value.slice(2)), value);
        }
      }
    const links = (rel) =>
      named('link')
        .filter((link) => attribute(link, 'rel') === rel)
        .map((link) => attribute(link, 'href'));
    assert.deepEqual(links('stylesheet'), ['./title.css']);
    // Every packaged module but the entry is fetched up front.
    assert.deepEqual(
      links('modulepreload'),
      Object.keys(files)
        .filter((name) => name.endsWith('.js') && name !== 'title.js')
        .sort()
        .map((name) => './' + name),
    );
  }));

test('Slipface build refuses a checkout it cannot vouch for', () =>
  withFixtures((root, out) => {
    const attempt = (source, pin = source.head) =>
      build({ source: source.dir, out, pin });

    const dirty = checkout(root, game);
    writeFileSync(join(dirty.dir, 'src/sim/rng.js'), 'export const rng = 5;\n');
    assert.throws(() => attempt(dirty), /uncommitted changes/);

    assert.throws(
      () => attempt(checkout(root, game, { origin: null })),
      /no origin remote/,
    );
    for (const origin of [
      'https://gitlab.com/example/slipface',
      'https://github.com/example',
      'https://github.com/example/slipface/tree/main',
      'http://github.com/example/slipface',
      'https://user:secret@github.com/example/slipface',
      'file:///srv/slipface',
    ])
      assert.throws(
        () => attempt(checkout(root, game, { origin })),
        /Unsupported Slipface remote/,
        origin,
      );

    const moved = checkout(root, game);
    assert.throws(
      () => attempt(moved, 'a'.repeat(40)),
      /Unexpected Slipface source revision/,
    );
    assert.throws(() => build({ out, pin: moved.head }), /Pass the path/);
    assert.equal(existsSync(out), false);
  }));

test('Slipface build refuses source that leaves the title or reaches a device', () =>
  withFixtures((root, out) => {
    const attempt = (changes) => {
      const source = checkout(root, { ...game, ...changes });
      return build({ source: source.dir, out, pin: source.head });
    };
    const sim = game['src/sim/sim.js'];
    for (const [changes, expected] of [
      [
        { 'src/sim/sim.js': "import '../../tools/build.mjs';\n" + sim },
        /Import escaped title/,
      ],
      [
        { 'src/sim/sim.js': "import '../../../outside.js';\n" + sim },
        /Import escaped title/,
      ],
      [
        { 'src/sim/sim.js': "import data from './data.json';\n" + sim },
        /Unsupported Slipface import/,
      ],
      [
        { 'src/sim/sim.js': "import three from 'three';\n" + sim },
        /Unsupported Slipface import/,
      ],
      [
        {
          'src/sim/sim.js':
            "import x from 'https://example.invalid/x.js';\n" + sim,
        },
        /Unsupported Slipface import/,
      ],
      [
        { 'src/sim/sim.js': "import './missing.js';\n" + sim },
        /Missing Slipface module: src\/sim\/missing\.js/,
      ],
      [
        { 'src/sim/sim.js': "const lazy = import('./' + name);\n" + sim },
        /Computed title import/,
      ],
      // The standalone page's controller and database code is never packaged.
      [
        { 'src/game.js': "import './standalone.js';\n" + game['src/game.js'] },
        /reaches a device module: src\/standalone\.js/,
      ],
      [
        { 'src/game.js': "import './main.js';\n" + game['src/game.js'] },
        /reaches a device module: src\/main\.js/,
      ],
      ...[
        'navigator.getGamepads()',
        'indexedDB.open("x")',
        'localStorage.getItem("x")',
        'sessionStorage.length',
        'fetch("/scores")',
        'new XMLHttpRequest()',
        'new WebSocket("wss://example.invalid")',
        'navigator.sendBeacon("/x")',
        'document.cookie',
        'eval("1")',
        'new Function("return 1")',
      ].map((code) => [
        { 'src/sim/rng.js': `export const rng = () => ${code};\n` },
        /reaches a device API: src\/sim\/rng\.js/,
      ]),
    ])
      assert.throws(() => attempt(changes), expected);
    assert.equal(existsSync(out), false);
  }));

test('Slipface build leaves the previous artifacts alone when it refuses', () =>
  withFixtures((root, out) => {
    const good = checkout(root, game);
    build({ source: good.dir, out, pin: good.head });
    const before = readBuiltTitle(out);
    const bad = checkout(root, {
      ...game,
      'src/sim/rng.js': 'export const rng = () => localStorage.length;\n',
    });
    assert.throws(() => build({ source: bad.dir, out, pin: bad.head }));
    assert.deepEqual(readBuiltTitle(out), before);
    // A changed artifact is caught by the record the catalog reads.
    writeFileSync(new URL('game.js', out), 'export const createGame = 0;\n');
    assert.throws(() => readBuiltTitle(out), /Built artifact changed/);
  }));

test('Slipface adapter keeps to the host channel and imports nothing outside the title', () => {
  const dir = new URL('../packages/slipface/src/', import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.js'))) {
    const code = readFileSync(new URL(name, dir), 'utf8');
    assert.doesNotMatch(code, deviceApi, name);
    for (const [, spec] of code.matchAll(/\bfrom '([^']+)'/g))
      assert.match(spec, /^\.\/[a-zA-Z0-9._-]+\.js$/, `${name} -> ${spec}`);
  }
});

test(
  'built Slipface is a blocked, guest-local, request-free catalog entry',
  {
    skip: !existsSync(
      new URL('../dist/slipface/build-record.json', import.meta.url),
    ),
  },
  () => {
    const title = creatorTitles().find((t) => t.manifest.id === 'slipface');
    assert.ok(title);
    validateMetadata(title.metadata);
    assert.match(title.publicationBlocked, /Private creator/);
    assert.equal(title.assetRequests, false);
    assert.equal(title.manifest.provenance.source.rightsStatus, 'unknown');
    assert.equal(title.manifest.provenance.source.license, 'unknown');
    assert.equal(title.manifest.provenance.source.revision, revision);
    assert.equal(title.manifest.saves.accountSync, 'disabled');
    assert.deepEqual(title.manifest.capabilities, ['save.local']);
    assert.deepEqual(title.manifest.input, { controller: true, touch: true });
    const names = Object.keys(title.titleFiles);
    assert.ok(names.includes('game.js'));
    for (const absent of [
      'main.js',
      'standalone.js',
      'input--gamepad.js',
      'persist--idb.js',
    ])
      assert.equal(names.includes(absent), false, absent);
    for (const [name, content] of Object.entries(title.titleFiles))
      if (name.endsWith('.js'))
        assert.doesNotMatch(content.toString(), deviceApi, name);
  },
);
