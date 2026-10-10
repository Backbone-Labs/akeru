import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROTOCOL,
  createGate,
  launchArgs,
} from '../packages/dead-end-dash/src/channel.js';
import {
  CARRY_MS,
  controlText,
  createHostInput,
  idle,
  mapControls,
  validInput,
} from '../packages/dead-end-dash/src/input.js';
import {
  KEYS,
  MAX_BYTES,
  SLOT,
  decode,
  encode,
  openHostStore,
} from '../packages/dead-end-dash/src/saves.js';
import {
  audioState,
  createActions,
  supported,
} from '../packages/dead-end-dash/src/actions.js';
import {
  partyUrl,
  validEndpoint,
} from '../packages/dead-end-dash/src/network.js';
import { multiplayerUrl } from '../packages/dead-end-dash/src/network-config.js';
import {
  deadEndDashOptions,
  deadEndDashTitles,
  describeDeadEndDash,
  withLocalRelay,
} from '../packages/dead-end-dash/catalog.mjs';
import {
  buildDeadEndDash,
  checkStylesheet,
  resolveGameImport,
} from '../packages/dead-end-dash/build.mjs';
import {
  digestSources,
  normalizeRemote,
  regularBlobs,
  revision,
  serverDigest,
  sourceDigest,
  sourceUrl,
} from '../packages/dead-end-dash/pinned.mjs';
import {
  fixture,
  fixtureUrl,
  run,
} from './fixtures/dead-end-dash-checkout.mjs';
import { readBuiltTitle } from '../packages/anarch/artifacts.mjs';
import {
  DEFAULT_MAPPINGS,
  normalizeRawControls,
} from '../packages/input/src/normalize.js';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
import { validateManifest } from '../packages/contracts/src/index.js';
import { validateMetadata } from '../platform/catalog/model.js';

const built = existsSync(
  new URL('../dist/dead-end-dash/build-record.json', import.meta.url),
);
const snapshot = (buttons = {}, axes = {}, extra = {}) => ({
  provider: 'gamepad',
  connected: true,
  buttons,
  axes,
  ...extra,
});
/** Fails with the offending text, not a quarter of a megabyte of bundle. */
const absent = (text, pattern, what) =>
  assert.equal(pattern.exec(text)?.[0] ?? null, null, what);
const read = (provider) => {
  const out = idle();
  const active = provider.read(out);
  return { ...out, active };
};

test('a standard controller reaches every game action; Menu and Home never do', () => {
  const controls = normalizeRawControls(
    {
      buttons: {
        south: 1,
        east: 1,
        west: 1,
        north: 1,
        leftShoulder: 1,
        rightShoulder: 1,
        rightTrigger: 0.9,
        select: 1,
        start: 1,
        home: 1,
        dpadUp: 1,
      },
      axes: { leftX: 0.8, leftY: -0.6 },
    },
    DEFAULT_MAPPINGS.gamepad,
    0.15,
  );
  const got = mapControls(controls);
  assert.equal(got.held.jump, 1);
  assert.equal(got.held.confirm, 1);
  assert.equal(got.held.back, 1);
  assert.equal(got.held.shove, 1);
  assert.equal(got.held.ping, 1);
  assert.equal(got.held.pause, 1, 'View opens the game menu');
  assert.equal(got.held.up, 1);
  assert(got.mx > 0.7 && got.my < -0.5);
  // Start opens Akeru's menu and Home belongs to Backbone: neither is a game action.
  const only = mapControls({ buttons: { menu: 1, home: 1, start: 1 } });
  assert.deepEqual(only, idle());
});

test('each shove and ping button works alone, triggers are analog and sticks stay inside the unit circle', () => {
  for (const name of ['west', 'cancel', 'rightTrigger'])
    assert.equal(mapControls({ buttons: { [name]: 1 } }).held.shove, 1);
  for (const name of ['north', 'leftShoulder', 'rightShoulder'])
    assert.equal(mapControls({ buttons: { [name]: 1 } }).held.ping, 1);
  assert.equal(mapControls({ buttons: { rightTrigger: 0.4 } }).held.shove, 0.4);
  assert.equal(mapControls({ buttons: { confirm: 1 } }).held.shove, 0);
  const corner = mapControls({ axes: { moveX: 1, moveY: 1 } });
  assert(Math.abs(Math.hypot(corner.mx, corner.my) - 1) < 1e-9);
  // Values outside the contract are bounded, not trusted.
  const wild = mapControls({
    buttons: { confirm: 7, cancel: -3, west: NaN },
    axes: { moveX: -9, moveY: Infinity },
  });
  assert.equal(wild.held.jump, 1);
  assert.equal(wild.held.back, 0);
  assert.equal(wild.held.shove, 0);
  assert.equal(wild.mx, -1);
  assert.equal(wild.my, 0);
});

test('malformed input payloads change nothing', () => {
  const provider = createHostInput();
  assert.equal(
    provider.receive(snapshot({ confirm: 1 }, { moveX: 0.5 })),
    true,
  );
  const before = read(provider);
  for (const bad of [
    null,
    [],
    'input',
    {},
    snapshot({}, {}, { provider: 'keyboard' }),
    snapshot({}, {}, { connected: 'yes' }),
    snapshot({ confirm: '1' }),
    snapshot({ 'bad name': 1 }),
    snapshot({}, { moveX: NaN }),
    snapshot([], {}),
    snapshot(
      Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['b' + i, 0])),
    ),
    { provider: 'gamepad', connected: true, buttons: {} },
  ]) {
    assert.equal(validInput(bad), false);
    assert.equal(provider.receive(bad), false);
    assert.deepEqual(read(provider), before);
  }
});

test('held input survives the game clearing it, and never survives pause, disconnect or a disconnected snapshot', () => {
  let clock = 0;
  const later = () => (clock += CARRY_MS + 1);
  const provider = createHostInput({ now: () => clock });
  let presses = 0,
    changes = 0;
  provider.onPress = () => presses++;
  provider.onChange = () => changes++;
  provider.receive(snapshot({}, { moveX: 1 }));
  assert.equal(presses, 0, 'a stick is not a button press');
  // The host sends a snapshot only on change. The game clears input when a
  // dash starts; a stick that is still held must keep moving the dasher.
  provider.reset();
  assert.equal(read(provider).mx, 1);
  assert.equal(read(provider).active, true);

  provider.receive(snapshot({ confirm: 1 }, { moveX: 1 }));
  provider.receive(snapshot({ confirm: 1, west: 1 }, { moveX: 1 }));
  assert.equal(presses, 1, 'one press from none down, not one per button');
  provider.receive(snapshot());
  provider.receive(snapshot({ north: 1 }));
  assert.equal(presses, 2);

  provider.neutral();
  assert.deepEqual(read(provider), { ...idle(), active: false });
  later();

  // No controller is assumed until the host reports one.
  assert.equal(provider.connected, false);
  provider.setConnected(true);
  assert.equal(changes, 1);
  provider.receive(snapshot({ confirm: 1 }, { moveX: 1 }));
  provider.setConnected(false);
  assert.equal(provider.connected, false);
  assert.deepEqual(read(provider), { ...idle(), active: false });
  provider.setConnected(false);
  provider.setConnected('yes');
  assert.equal(changes, 2, 'only a real change is reported');
  provider.setConnected(true);
  assert.equal(changes, 3);
  later();

  // A disconnected provider cannot hold anything, whatever the payload says.
  provider.receive(
    snapshot({ confirm: 1 }, { moveX: 1 }, { connected: false }),
  );
  assert.deepEqual(read(provider), { ...idle(), active: false });

  // The on-screen pad and the Backbone bridge both arrive as `touch`; to the
  // game they are sticks and buttons, so its menu highlight stays on.
  provider.receive(snapshot({ up: 1 }, {}, { provider: 'touch' }));
  assert.equal(provider.name, 'gamepad');
  assert.equal(read(provider).held.up, 1);
  provider.dispose();
  assert.equal(provider.onPress, null);
});

test('a button held through a pause is not a press, and a press made later is never swallowed', () => {
  let clock = 1000;
  let presses = 0;
  const provider = createHostInput({ now: () => clock });
  provider.onPress = () => presses++;
  // The app's pill closes on A. The bridge keeps reporting A, held, as the
  // game resumes: that must not select whatever the game has focused.
  provider.neutral();
  clock += 20;
  provider.receive(snapshot({ confirm: 1 }, { moveX: 1 }));
  assert.equal(read(provider).held.confirm, 0);
  assert.equal(read(provider).held.jump, 0);
  assert.equal(read(provider).mx, 1, 'a stick held through it still steers');
  assert.equal(presses, 0);
  clock += 5000;
  provider.receive(snapshot({ confirm: 1, west: 1 }));
  assert.equal(read(provider).held.confirm, 0, 'still the same hold');
  assert.equal(read(provider).held.shove, 1, 'another button is a real press');
  assert.equal(presses, 1);
  provider.receive(snapshot());
  provider.receive(snapshot({ confirm: 1 }));
  assert.equal(read(provider).held.confirm, 1, 'released, then pressed');

  // A host that reports changes only sends nothing after the pause until the
  // next press. That press, any time later, counts at once.
  provider.neutral();
  clock += CARRY_MS + 1;
  provider.receive(snapshot({ confirm: 1 }));
  assert.equal(read(provider).held.confirm, 1);
  // A new pause forgets the old hold: nothing stays ignored for ever.
  provider.neutral();
  clock += 10;
  provider.receive(snapshot({ north: 1 }));
  assert.equal(read(provider).held.ping, 0);
  provider.neutral();
  clock += CARRY_MS + 1;
  provider.receive(snapshot({ north: 1 }));
  assert.equal(read(provider).held.ping, 1);
});

test('rumble is a bounded request that the host channel accepts', () => {
  const sent = [];
  const provider = createHostInput({ rumble: (effect) => sent.push(effect) });
  provider.rumble(220, 0.9);
  provider.rumble(99999, 5);
  provider.rumble(-4, -1);
  provider.rumble(NaN, NaN);
  assert.deepEqual(sent[0], {
    duration: 220,
    strongMagnitude: 0.9,
    weakMagnitude: 0.54,
  });
  const received = [];
  const frame = { postMessage() {} };
  const channel = createRuntimeChannel({
    frame,
    origin: 'https://title.example',
    nonce: 'a'.repeat(32),
    onRumble: (effect) => received.push(effect),
  });
  let sequence = 0;
  const deliver = (type, payload) =>
    channel.receive({
      source: frame,
      origin: 'https://title.example',
      data: {
        protocol: 'akeru.catalog.v1',
        nonce: 'a'.repeat(32),
        sequence: sequence++,
        type,
        payload,
      },
    });
  assert.equal(deliver('playable', { sdkVersion: '0.1.0' }), true);
  for (const effect of sent) assert.equal(deliver('rumble', effect), true);
  assert.equal(received.length, 4);
  channel.dispose();
});

test('How to Play names Akeru’s bindings without touching the other lines', () => {
  assert.match(controlText.pad.pause, /View/);
  assert.deepEqual(Object.keys(controlText.pad), ['pause']);
  assert.equal(controlText.touch.jump, 'A');
  assert.equal(Object.isFrozen(controlText.touch), true);
});

const fakeService = (initial = null) => {
  let record = initial,
    counter = 0;
  const calls = [];
  return {
    calls,
    get record() {
      return record;
    },
    set record(value) {
      record = value;
    },
    fail: null,
    async read(slot) {
      calls.push(['read', slot]);
      if (this.fail) throw Object.assign(new Error('x'), { code: this.fail });
      return record ? { ...record, bytes: record.bytes.slice() } : null;
    },
    async write(slot, value, expectedRevision) {
      calls.push(['write', slot, expectedRevision]);
      if (this.fail) throw Object.assign(new Error('x'), { code: this.fail });
      if ((record?.revision ?? null) !== expectedRevision)
        throw Object.assign(new Error('x'), { code: 'conflict' });
      record = {
        schemaVersion: value.schemaVersion,
        bytes: value.bytes.slice(),
        revision: 'r' + ++counter,
      };
      return { revision: record.revision };
    },
  };
};

test('the save codec round-trips the game’s documents and refuses everything else', () => {
  const docs = {
    settings: { schema: 1, data: { name: 'Bravish Bean', muted: true } },
    records: { schema: 1, data: { descents: 3 } },
    solo: { schema: 1, data: { dp: 2 } },
    'solo.unreadable': { at: 5, doc: 'x' },
  };
  const bytes = encode(docs);
  assert.deepEqual({ ...decode({ schemaVersion: 1, bytes }) }, docs);
  // Only the game's own keys are ever written.
  assert.deepEqual(
    { ...decode({ schemaVersion: 1, bytes: encode({ ...docs, other: 1 }) }) },
    docs,
  );
  const text = (value) => new TextEncoder().encode(value);
  for (const [bad, code] of [
    [null, 'corrupt'],
    [{ schemaVersion: 1, bytes: 'text' }, 'corrupt'],
    [{ schemaVersion: 2, bytes }, 'migration'],
    [{ schemaVersion: 0, bytes }, 'corrupt'],
    [{ schemaVersion: 1, bytes: text('not json') }, 'corrupt'],
    [{ schemaVersion: 1, bytes: new Uint8Array([0xff, 0xfe]) }, 'corrupt'],
    [{ schemaVersion: 1, bytes: text('[]') }, 'corrupt'],
    [{ schemaVersion: 1, bytes: text('{"v":2,"docs":{}}') }, 'corrupt'],
    [{ schemaVersion: 1, bytes: text('{"v":1,"docs":[]}') }, 'corrupt'],
    [
      { schemaVersion: 1, bytes: text('{"v":1,"docs":{},"more":1}') },
      'corrupt',
    ],
    [
      { schemaVersion: 1, bytes: text('{"v":1,"docs":{"anotherTitle":1}}') },
      'corrupt',
    ],
    [
      { schemaVersion: 1, bytes: text('{"v":1,"docs":{"__proto__":{"x":1}}}') },
      'corrupt',
    ],
    [{ schemaVersion: 1, bytes: new Uint8Array(MAX_BYTES + 1) }, 'corrupt'],
  ])
    assert.throws(
      () => decode(bad),
      (error) => error.code === code,
    );
  assert.throws(
    () => encode({ solo: 'x'.repeat(MAX_BYTES) }),
    (error) => error.code === 'quota',
  );
  assert.deepEqual(
    [...KEYS],
    ['settings', 'records', 'solo', 'solo.unreadable'],
  );
});

test('the store reads one slot and writes with the revision the host gave', async () => {
  const service = fakeService();
  const store = await openHostStore(service);
  assert.equal(store.persistent, true);
  assert.equal(await store.get('solo'), undefined);
  await store.set('solo', { schema: 1, data: { dp: 1 } });
  await store.set('records', { schema: 1, data: { descents: 1 } });
  assert.deepEqual(service.calls, [
    ['read', SLOT],
    ['write', SLOT, null],
    ['write', SLOT, 'r1'],
  ]);
  // The game gets copies: changing a returned document changes nothing stored.
  const solo = await store.get('solo');
  solo.data.dp = 99;
  assert.equal((await store.get('solo')).data.dp, 1);
  await store.remove('solo');
  await store.remove('solo');
  assert.equal(service.calls.length, 4, 'removing nothing writes nothing');
  await assert.rejects(store.set('anotherTitle', 1), { code: 'invalid' });
  await assert.rejects(store.get('../progress'), { code: 'invalid' });

  // A second session sees exactly what the first one left.
  const again = await openHostStore(service);
  assert.deepEqual(await again.get('records'), {
    schema: 1,
    data: { descents: 1 },
  });
  assert.equal(await again.get('solo'), undefined);
});

test('changes made while a write is in flight ride together on the next one, never in parallel', async () => {
  const service = fakeService();
  let inFlight = 0,
    overlapped = false;
  const write = service.write.bind(service);
  service.write = async (...args) => {
    overlapped ||= ++inFlight > 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      return await write(...args);
    } finally {
      inFlight--;
    }
  };
  const store = await openHostStore(service);
  await Promise.all([
    store.set('settings', { n: 1 }),
    store.set('records', { n: 2 }),
    store.set('solo', { n: 3 }),
  ]);
  const writes = service.calls.filter(([op]) => op === 'write');
  // The first change starts a write; the two made meanwhile share the second,
  // which carries the revision the first one returned.
  assert.deepEqual(writes, [
    ['write', SLOT, null],
    ['write', SLOT, 'r1'],
  ]);
  assert.equal(overlapped, false);
  assert.deepEqual(
    { ...decode(service.record) },
    { settings: { n: 1 }, records: { n: 2 }, solo: { n: 3 } },
  );
  await store.flush();
  assert.equal(
    service.calls.filter(([op]) => op === 'write').length,
    writes.length,
    'nothing unsaved, nothing written',
  );
});

test('an unreadable, newer or unavailable save is never overwritten', async () => {
  const old = {
    schemaVersion: 1,
    bytes: new TextEncoder().encode('{"old":1}'),
    revision: 'kept',
  };
  for (const [initial, fail, code] of [
    [old, null, 'corrupt'],
    [{ ...old, schemaVersion: 3 }, null, 'migration'],
    [null, 'unavailable', 'unavailable'],
    [null, 'quota', 'quota'],
  ]) {
    const service = fakeService(initial);
    service.fail = fail;
    const blocked = [];
    const store = await openHostStore(service, {
      onBlocked: (reason) => blocked.push(reason),
    });
    service.fail = null;
    assert.deepEqual(blocked, [code]);
    assert.equal(store.persistent, false);
    // The session carries on in memory, as the game's own fallback does.
    await store.set('records', { schema: 1, data: { descents: 9 } });
    assert.deepEqual(await store.get('records'), {
      schema: 1,
      data: { descents: 9 },
    });
    await assert.rejects(store.flush(), { code });
    assert.equal(
      service.calls.some(([op]) => op === 'write'),
      false,
    );
    assert.deepEqual(service.record, initial);
  }
  // The host said local saves are unavailable: do not even ask.
  const service = fakeService(old);
  const store = await openHostStore(service, { available: false });
  await store.set('solo', { dp: 1 });
  assert.equal(store.persistent, false);
  assert.deepEqual(service.calls, []);
});

test('another window’s newer save stops writing instead of being replaced', async () => {
  const service = fakeService();
  const blocked = [];
  const store = await openHostStore(service, {
    onBlocked: (reason) => blocked.push(reason),
  });
  await store.set('solo', { dp: 1 });
  const theirs = {
    schemaVersion: 1,
    bytes: encode({ solo: { dp: 5 } }),
    revision: 'theirs',
  };
  service.record = theirs;
  await store.set('solo', { dp: 2 });
  assert.deepEqual(blocked, ['conflict']);
  assert.equal(store.persistent, false);
  await store.set('records', { n: 1 });
  assert.deepEqual(service.record, theirs);
  assert.equal(blocked.length, 1, 'said once');
  // A write the host never acknowledged with a revision also stops saving.
  const silent = fakeService();
  silent.write = async () => ({});
  const second = await openHostStore(silent);
  await second.set('solo', { dp: 1 });
  assert.equal(second.blocked, 'unavailable');
});

const fakeGame = (over = {}) => {
  const game = {
    online: false,
    session: null,
    restarts: 0,
    status: { muted: false, state: 'running' },
    audioStatus: () => ({ ...game.status }),
    setMuted(value) {
      game.status.muted = value;
    },
    restart() {
      game.restarts++;
      game.session = null;
    },
    ...over,
  };
  return game;
};
const ask = async (config, action, id = 1) => {
  const sent = [];
  const actions = createActions({
    flush: async () => {},
    heldSound: () => false,
    ...config,
    send: (type, payload) => sent.push({ type, payload }),
  });
  await actions.receive({ id, action });
  return sent;
};

test('menu actions say what the game really saves, and their replies pass the host channel', async () => {
  const frame = { postMessage() {} };
  const origin = 'https://title.example',
    nonce = 'b'.repeat(32);
  const channel = createRuntimeChannel({ frame, origin, nonce });
  let sequence = 0;
  const deliver = (type, payload) =>
    channel.receive({
      source: frame,
      origin,
      data: {
        protocol: 'akeru.catalog.v1',
        nonce,
        sequence: sequence++,
        type,
        payload,
      },
    });
  deliver('playable', { sdkVersion: '0.1.0' });
  assert.equal(deliver('actions', { supported: [...supported] }), true);
  assert.deepEqual([...channel.actions].sort(), [...supported].sort());

  const game = fakeGame();
  // A reply must be accepted by the real channel: drive one request fully.
  const posted = [];
  frame.postMessage = (message) => posted.push(message);
  const pending = channel.requestAction('save');
  const request = posted.at(-1);
  assert.equal(request.type, 'action');
  const [reply] = await ask({ game }, 'save', request.payload.id);
  assert.equal(deliver(reply.type, reply.payload), true);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.match(result.message, /last huddle/);
  assert.deepEqual(result.state, { hasManualSave: false, savedAt: null });
  channel.dispose();

  // No snapshot of a dash exists: never claimed, never restored.
  const [restore] = await ask({ game }, 'restore');
  assert.equal(restore.payload.ok, false);
  assert.equal(restore.payload.state.hasManualSave, false);
  // Nothing to restart on the title screen; a descent goes back to it.
  assert.equal((await ask({ game }, 'restart'))[0].payload.ok, false);
  game.session = {};
  assert.equal((await ask({ game }, 'restart'))[0].payload.ok, true);
  assert.equal(game.restarts, 1);
  // A party belongs to the party.
  const party = fakeGame({ online: true, session: {} });
  const [refused] = await ask({ game: party }, 'restart');
  assert.equal(refused.payload.ok, false);
  assert.equal(party.restarts, 0);
  assert.match(
    (await ask({ game: party }, 'save'))[0].payload.message,
    /party/,
  );
  // A failed write is reported, not hidden.
  const [failed] = await ask(
    { game, flush: () => Promise.reject(new Error('conflict')) },
    'save',
  );
  assert.equal(failed.payload.ok, false);
  assert.match(failed.payload.message, /unavailable/);
});

test('the sound switch is the player’s setting, and sound that never started is never reported as on', async () => {
  const game = fakeGame();
  assert.equal(
    (await ask({ game }, 'audio-status'))[0].payload.state.audioState,
    'on',
  );
  assert.equal(
    (await ask({ game }, 'audio'))[0].payload.state.audioState,
    'off',
  );
  assert.equal(game.status.muted, true);
  assert.equal(
    (await ask({ game }, 'audio'))[0].payload.state.audioState,
    'on',
  );
  // Sound that was playing when the host menu opened is suspended, not refused.
  assert.equal(audioState({ muted: false, state: 'suspended' }, true), 'on');
  // Sound a controller press could not start is also `suspended`. The pill
  // is only reachable while paused, so this is where the player must be told.
  assert.equal(
    audioState({ muted: false, state: 'suspended' }, false),
    'blocked',
  );
  assert.equal(audioState({ muted: false, state: 'locked' }, true), 'blocked');
  assert.equal(
    audioState({ muted: false, state: 'unavailable' }, false),
    'off',
  );
  const refused = fakeGame({ status: { muted: false, state: 'suspended' } });
  const [blocked] = await ask(
    { game: refused, heldSound: () => false },
    'audio-status',
  );
  assert.equal(blocked.payload.ok, true);
  assert.equal(blocked.payload.state.audioState, 'blocked');
  assert.match(blocked.payload.message, /tap the game once/);
  // Unknown actions and malformed requests get no reply at all.
  for (const bad of [
    null,
    {},
    { id: 1.5, action: 'save' },
    { id: 1, action: 'exit' },
  ]) {
    const sent = [];
    await createActions({
      game,
      flush: async () => {},
      heldSound: () => false,
      send: (...a) => sent.push(a),
    }).receive(bad);
    assert.deepEqual(sent, []);
  }
});

test('only the launching window, at its origin, with this session’s nonce and a new sequence number is heard', () => {
  const shell = 'https://shell.example',
    nonce = 'n'.repeat(32),
    source = {};
  const event = (over = {}, data = {}) => ({
    source,
    origin: shell,
    data: {
      protocol: PROTOCOL,
      nonce,
      sequence: 0,
      type: 'input',
      payload: { ok: true },
      ...data,
    },
    ...over,
  });
  // Each check alone: everything else about the message is right.
  for (const [name, forged] of [
    ['another window', event({ source: {} })],
    ['the title’s own window', event({ source: null })],
    ['another origin', event({ origin: 'https://evil.example' })],
    ['the title’s own origin', event({ origin: 'https://title.example' })],
    ['another nonce', event({}, { nonce: 'x'.repeat(32) })],
    ['no nonce', event({}, { nonce: undefined })],
    ['another protocol', event({}, { protocol: 'akeru.catalog.v2' })],
    ['a fractional sequence', event({}, { sequence: 0.5 })],
    ['a text sequence', event({}, { sequence: '0' })],
    ['no type', event({}, { type: undefined })],
    ['no data', { source, origin: shell, data: null }],
    ['text data', { source, origin: shell, data: 'input' }],
  ]) {
    const accept = createGate({ source, shell, nonce });
    assert.equal(accept(forged), null, name);
    // Being refused must not use up the sequence number.
    assert.deepEqual(accept(event()), {
      type: 'input',
      payload: { ok: true },
    });
  }
  const accept = createGate({ source, shell, nonce });
  assert.ok(accept(event({}, { sequence: 4 })));
  assert.equal(accept(event({}, { sequence: 4 })), null, 'a replay');
  assert.equal(accept(event({}, { sequence: 3 })), null, 'an older message');
  assert.ok(accept(event({}, { sequence: 5 })));
});

test('a page not launched by the shell has no channel at all', () => {
  const nonce = 'a'.repeat(32);
  assert.deepEqual(
    launchArgs(
      `#nonce=${nonce}&shell=${encodeURIComponent('https://shell.example')}`,
    ),
    { shell: 'https://shell.example', nonce },
  );
  for (const hash of [
    '',
    '#',
    `#nonce=${nonce}`,
    '#shell=https%3A%2F%2Fshell.example',
    `#nonce=short&shell=https%3A%2F%2Fshell.example`,
    `#nonce=${nonce}&shell=https%3A%2F%2Fshell.example%2Fpath`,
    `#nonce=${nonce}&shell=*`,
    `#nonce=${nonce}&shell=null`,
    `#nonce=${nonce}&shell=javascript%3Aalert(1)`,
    `#nonce=${'!'.repeat(32)}&shell=https%3A%2F%2Fshell.example`,
  ])
    assert.equal(launchArgs(hash), null, hash);
});

test('the party address that ships is off or one exact secure address, and anything else is no address', () => {
  // What is committed. Switching parties on changes that one line, and a
  // malformed address there fails here rather than quietly in a player's hands.
  assert.ok(
    multiplayerUrl === null || validEndpoint(multiplayerUrl),
    'network-config.js holds neither null nor wss://<host>/ws',
  );
  const page = { protocol: 'https:', host: 'title.example' };
  assert.equal(partyUrl(null, page), '');
  assert.equal(
    partyUrl('wss://relay.example/ws', page),
    'wss://relay.example/ws',
  );
  assert.equal(
    partyUrl('wss://relay.example:8443/ws', page),
    'wss://relay.example:8443/ws',
  );
  // The local preview's bridge, on whichever scheme the page has.
  assert.equal(partyUrl('same-origin', page), 'wss://title.example/ws');
  assert.equal(
    partyUrl('same-origin', { protocol: 'http:', host: '127.0.0.1:4174' }),
    'ws://127.0.0.1:4174/ws',
  );
  for (const bad of [
    undefined,
    '',
    0,
    true,
    {},
    'relay.example/ws',
    'ws://relay.example/ws',
    'https://relay.example/ws',
    'wss://relay.example',
    'wss://relay.example/',
    'wss://relay.example/relay',
    'wss://relay.example/ws/',
    'wss://relay.example/ws?room=1',
    'wss://relay.example/ws#x',
    'wss://user:secret@relay.example/ws',
    'wss://RELAY.example/ws',
    'wss://relay.example:443/ws',
    ' wss://relay.example/ws',
    'wss://localhost/ws',
    'wss://dev.localhost/ws',
    'wss://127.0.0.1:8080/ws',
    'wss://0.0.0.0/ws',
    'wss://[::1]/ws',
    'javascript:alert(1)',
    'Same-Origin',
  ]) {
    assert.equal(validEndpoint(bad), false, String(bad));
    assert.equal(partyUrl(bad, page), '', String(bad));
  }
});

test('the local preview alone points the title at a bridged relay, and leaves the built files alone', () => {
  const options = { titleFiles: { 'network-config.js': Buffer.from('x') } };
  const local = withLocalRelay(options, 8787);
  assert.equal(typeof local.upgrade, 'function');
  assert.match(
    local.titleFiles['network-config.js'].toString(),
    /^export const multiplayerUrl = 'same-origin';\n$/,
  );
  assert.equal(options.titleFiles['network-config.js'].toString(), 'x');
  assert.equal(options.upgrade, undefined);
  for (const bad of [0, 80, 65536, 1.5, NaN, '8787'])
    assert.throws(() => withLocalRelay(options, bad));
});

// ---------------------------------------------------------------- the build

test('the pin names one repository, one commit and the bytes each recipe reads', () => {
  assert.match(
    sourceUrl,
    /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
  );
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.notEqual(revision, '0'.repeat(40));
  // One digest for what the title is built from, one for the party relay.
  for (const digest of [sourceDigest, serverDigest]) {
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, '0'.repeat(64));
  }
  assert.notEqual(sourceDigest, serverDigest);
});

test('remotes, tree entries, imports and stylesheets are each checked on their own', () => {
  for (const same of [
    'https://github.com/owner/dead-end-dash',
    'https://github.com/owner/dead-end-dash.git',
    'git@github.com:owner/dead-end-dash.git',
    ' https://github.com/owner/dead-end-dash.git\n',
  ])
    assert.equal(
      normalizeRemote(same),
      'https://github.com/owner/dead-end-dash',
    );
  for (const bad of [
    '',
    'https://example.org/owner/dead-end-dash',
    'https://github.com/owner',
    'https://github.com/owner/repo/extra',
    'https://user:token@github.com/owner/repo',
    'http://github.com/owner/repo',
    'file:///srv/dead-end-dash',
    '../dead-end-dash',
    'https://github.com.evil.example/owner/repo',
  ])
    assert.throws(() => normalizeRemote(bad), /Unsupported/, bad);

  const tree = [
    '100644 blob ' + 'a'.repeat(40) + '\tsrc/game.js',
    '100755 blob ' + 'b'.repeat(40) + '\tscripts/build.mjs',
    '120000 blob ' + 'c'.repeat(40) + '\tsrc/link.js',
    '160000 commit ' + 'd'.repeat(40) + '\tvendor/sub',
    '040000 tree ' + 'e'.repeat(40) + '\tsrc',
  ].join('\n');
  assert.deepEqual(
    [...regularBlobs(tree)],
    ['src/game.js', 'scripts/build.mjs'],
  );

  assert.equal(
    resolveGameImport('src/game.js', './sim/maze.js'),
    'src/sim/maze.js',
  );
  assert.equal(
    resolveGameImport('src/sim/maze.js', '../config.js'),
    'src/config.js',
  );
  assert.equal(
    resolveGameImport('src/game.js', './ui/styles.css'),
    'src/ui/styles.css',
  );
  assert.equal(
    resolveGameImport(
      'src/game.js',
      '../assets/fonts/pixelify-sans-latin-400-normal.woff2',
    ),
    'assets/fonts/pixelify-sans-latin-400-normal.woff2',
  );
  for (const [importer, specifier] of [
    ['src/game.js', 'ws'],
    ['src/game.js', 'node:fs'],
    ['src/game.js', '/etc/passwd'],
    ['src/game.js', 'https://example.org/x.js'],
    ['src/game.js', '../../outside.js'],
    ['src/game.js', '../server/relay.mjs'],
    ['src/game.js', '../package.json'],
    ['src/game.js', './other.css'],
    ['src/game.js', '../assets/fonts/other.woff2'],
    ['src/game.js', './a/../../../x.js'],
  ])
    assert.throws(
      () => resolveGameImport(importer, specifier),
      /imports a package|Unexpected game source import/,
      specifier,
    );

  assert.equal(checkStylesheet('.ded{color:red}'), '.ded{color:red}');
  for (const css of [
    '.a{background:url(x.png)}',
    '.a{background:URL("https://example.org/x")}',
    '@import "x.css";',
    '@font-face{font-family:x}',
  ])
    assert.throws(() => checkStylesheet(css), /loads another resource/);
  assert.equal(
    digestSources(
      new Map([
        ['b', '2'],
        ['a', '1'],
      ]),
    ),
    digestSources(
      new Map([
        ['a', '1'],
        ['b', '2'],
      ]),
    ),
  );
  assert.notEqual(
    digestSources(new Map([['a', '1']])),
    digestSources(new Map([['a', '2']])),
  );
});

test('the recipe builds a pinned checkout into hashed files and nothing else', async () => {
  const f = fixture();
  try {
    const first = await buildDeadEndDash(f.dir, f.outUrl, f.pin);
    assert.equal(first.version, '9.9.9');
    assert.deepEqual(first.files, [
      'OFL-Pixelify-Sans.txt',
      'adapter.css',
      'game.css',
      'index.html',
      'network-config.js',
      'pixelify-sans-400.woff2',
      'pixelify-sans-700.woff2',
      'save-client.js',
      'title.js',
    ]);
    // The catalog's own reader accepts the record and re-checks every hash.
    const built = readBuiltTitle(f.outUrl);
    const record = JSON.parse(built['build-record.json']);
    assert.equal(record.revision, f.pin.revision);
    assert.equal(record.sourceUrl, fixtureUrl);
    assert.deepEqual(
      record.source.map((s) => s.path),
      [
        'assets/fonts/OFL-Pixelify-Sans.txt',
        'assets/fonts/pixelify-sans-latin-400-normal.woff2',
        'assets/fonts/pixelify-sans-latin-700-normal.woff2',
        'package.json',
        'src/config.js',
        'src/game.js',
        'src/ui/styles.css',
      ],
    );
    const bundle = built['title.js'].toString();
    assert.match(bundle, /fixture-game/);
    // The stylesheet and typeface are files, not text inside the script.
    absent(bundle, /color:red|four/, 'stylesheet or typeface inlined');
    assert.equal(built['game.css'].toString(), '.ded{color:red}\n');
    assert.equal(built['pixelify-sans-400.woff2'].toString(), 'four');
    // Nothing about the machine that built it is in the output.
    absent(
      bundle,
      /akeru-ded-fixture|\/home\/|\/Users\/|\/tmp\//,
      'a local path',
    );
    // The same commit gives the same bytes, and the digest pins them.
    const again = await buildDeadEndDash(f.dir, f.outUrl, {
      ...f.pin,
      sourceDigest: first.sourceDigest,
    });
    assert.equal(again.sourceDigest, first.sourceDigest);
    assert.deepEqual(readBuiltTitle(f.outUrl)['title.js'], built['title.js']);
    // The catalog options built from it are a valid, publication-blocked entry.
    const title = describeDeadEndDash(built, record);
    validateMetadata(title.metadata);
    assert.equal(title.metadata.creator, 'fixture');
    const complete = {
      ...title.manifest,
      artifacts: Object.keys(built).map((path) => ({
        path,
        sha256: 'a'.repeat(64),
      })),
    };
    assert.deepEqual(validateManifest(complete), { valid: true, errors: [] });
    assert.match(title.publicationBlocked, /rights are recorded as unknown/);
    assert.equal(title.manifest.version, '9.9.9');
    assert.equal(title.manifest.provenance.source.rightsStatus, 'unknown');
    assert.equal(title.manifest.provenance.source.license, 'unknown');
    assert.equal(title.manifest.saves.accountSync, 'disabled');
    assert.deepEqual(title.manifest.capabilities, ['save.local']);
    const licence = Object.fromEntries(
      title.manifest.provenance.assets.map((a) => [
        a.path,
        [a.kind, a.license],
      ]),
    );
    assert.deepEqual(licence, {
      'OFL-Pixelify-Sans.txt': ['upstream', 'OFL-1.1'],
      'pixelify-sans-400.woff2': ['upstream', 'OFL-1.1'],
      'pixelify-sans-700.woff2': ['upstream', 'OFL-1.1'],
      'save-client.js': ['original', 'MIT'],
      'adapter.css': ['generated', 'unknown'],
      'build-record.json': ['generated', 'unknown'],
      'game.css': ['generated', 'unknown'],
      'index.html': ['generated', 'unknown'],
      'network-config.js': ['generated', 'unknown'],
      'title.js': ['generated', 'unknown'],
    });
    // Rights cannot be upgraded by editing a field: `documented` needs evidence
    // nobody has, and an approved state does not exist in the schema.
    for (const mutate of [
      (m) => (m.provenance.source.rightsStatus = 'approved'),
      (m) => (m.capabilities = ['save.local', 'network.any']),
      (m) => (m.provenance.assets = m.provenance.assets.slice(1)),
      (m) => (m.provenance.source.url = 'http://github.com/fixture/x'),
    ]) {
      const copy = structuredClone(complete);
      mutate(copy);
      assert.equal(validateManifest(copy).valid, false);
    }
    const packager = readFileSync(
      new URL('../scripts/package-public-preview.mjs', import.meta.url),
      'utf8',
    );
    assert.match(packager, /title\.publicationBlocked/);
  } finally {
    f.done();
  }
});

test('the recipe refuses the wrong commit, repository or bytes, and leaves the last good build alone', async () => {
  const f = fixture();
  try {
    const good = await buildDeadEndDash(f.dir, f.outUrl, f.pin);
    const before = readFileSync(join(f.out, 'build-record.json'), 'utf8');
    const refuse = (pin, pattern, dir = f.dir) =>
      assert.rejects(buildDeadEndDash(dir, f.outUrl, pin), pattern);
    await refuse(
      { ...f.pin, revision: 'a'.repeat(40) },
      /Unexpected Dead End Dash source revision/,
    );
    await refuse(
      { ...f.pin, sourceUrl: 'https://github.com/someone-else/dead-end-dash' },
      /not from the pinned repository/,
    );
    await refuse(
      { ...f.pin, sourceDigest: 'b'.repeat(64) },
      /does not match its pinned digest/,
    );
    await refuse(f.pin, /Not a Dead End Dash checkout/, join(f.dir, 'missing'));
    await assert.rejects(
      buildDeadEndDash('', f.outUrl, f.pin),
      /Pass the path/,
    );
    run(
      f.dir,
      'remote',
      'set-url',
      'origin',
      'https://example.org/fixture/dead-end-dash.git',
    );
    await refuse(f.pin, /Unsupported Dead End Dash remote/);
    run(f.dir, 'remote', 'remove', 'origin');
    await refuse(f.pin, /has no origin remote/);
    assert.equal(
      readFileSync(join(f.out, 'build-record.json'), 'utf8'),
      before,
    );
    assert.equal(JSON.parse(before).sourceDigest, good.sourceDigest);
  } finally {
    f.done();
  }
  // The command line behaves the same way, before anything is read.
  const none = spawnSync(
    process.execPath,
    ['packages/dead-end-dash/build.mjs'],
    {
      encoding: 'utf8',
    },
  );
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /Pass the path to the Dead End Dash checkout/);
  const empty = mkdtempSync(join(tmpdir(), 'akeru-ded-pin-'));
  try {
    run(empty, 'init', '-q');
    run(empty, 'commit', '-q', '--allow-empty', '-m', 'fixture');
    const wrong = spawnSync(
      process.execPath,
      ['packages/dead-end-dash/build.mjs', empty],
      { encoding: 'utf8' },
    );
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /Unexpected Dead End Dash source revision/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('a checkout cannot swap the pinned objects or get its own commands run', async () => {
  const f = fixture();
  try {
    const good = await buildDeadEndDash(f.dir, f.outUrl, f.pin);
    // 1. Replacement objects: HEAD still names the pinned commit, but Git
    //    would serve another commit's files in its place.
    writeFileSync(
      join(f.dir, 'src/game.js'),
      "export class Game { constructor() { this.marker = 'injected-game'; } }\n",
    );
    run(f.dir, 'commit', '-q', '-am', 'other');
    const other = run(f.dir, 'rev-parse', 'HEAD');
    run(f.dir, 'reset', '-q', '--hard', f.pin.revision);
    run(f.dir, 'replace', f.pin.revision, other);
    assert.match(run(f.dir, 'show', 'HEAD:src/game.js'), /injected-game/);
    // 2. Commands the checkout's own configuration would have Git run.
    const marker = join(f.out, '..', 'akeru-ded-executed-' + process.pid);
    const hook = join(f.dir, 'hook.sh');
    writeFileSync(hook, `#!/bin/sh\n: > "${marker}"\n`);
    chmodSync(hook, 0o755);
    run(f.dir, 'config', 'core.fsmonitor', hook);
    run(f.dir, 'config', 'filter.evil.clean', hook);
    run(f.dir, 'config', 'filter.evil.smudge', hook);
    run(f.dir, 'config', 'diff.evil.textconv', hook);
    mkdirSync(join(f.dir, '.git/info'), { recursive: true });
    writeFileSync(
      join(f.dir, '.git/info/attributes'),
      '* filter=evil diff=evil\n',
    );
    writeFileSync(
      join(f.dir, 'src/config.js'),
      "export const VERSION = 'dirty-tree';\n",
    );
    try {
      const built = await buildDeadEndDash(f.dir, f.outUrl, {
        ...f.pin,
        sourceDigest: good.sourceDigest,
      });
      assert.equal(built.sourceDigest, good.sourceDigest);
      const bundle = readFileSync(join(f.out, 'title.js'), 'utf8');
      assert.match(bundle, /fixture-game/);
      absent(bundle, /injected-game|dirty-tree/, 'unpinned bytes');
      assert.equal(existsSync(marker), false, 'nothing from the checkout ran');
    } finally {
      rmSync(marker, { force: true });
    }
  } finally {
    f.done();
  }
});

test('links, outside imports and stylesheets that fetch are refused at the source', async () => {
  for (const [change, pattern] of [
    [
      (files) => {
        files['src/game.js'] = "import './link.js';\n" + files['src/game.js'];
        files['src/link.js'] = { link: '/etc/hostname' };
      },
      /source file is missing: src\/link\.js/,
    ],
    [
      (files) =>
        (files['src/game.js'] = "import 'ws';\n" + files['src/game.js']),
      /imports a package: ws/,
    ],
    [
      (files) =>
        (files['src/game.js'] =
          "import '../server/relay.mjs';\n" + files['src/game.js']),
      /Unexpected game source import: server\/relay\.mjs/,
    ],
    [
      (files) =>
        (files['src/ui/styles.css'] =
          '.ded{background:url(https://example.org/x.png)}'),
      /stylesheet loads another resource/,
    ],
    [
      (files) => (files['package.json'] = '{"version":"1.0.0-evil\\n"}'),
      /Unexpected Dead End Dash version/,
    ],
    [
      (files) => delete files['assets/fonts/OFL-Pixelify-Sans.txt'],
      /source file is missing: assets\/fonts\/OFL-Pixelify-Sans\.txt/,
    ],
  ]) {
    const f = fixture(change);
    try {
      await assert.rejects(buildDeadEndDash(f.dir, f.outUrl, f.pin), pattern);
      assert.equal(existsSync(join(f.out, 'build-record.json')), false);
    } finally {
      f.done();
    }
  }
});

test('the title is listed only where it has been built', () => {
  // Regular builds and CI have no checkout of the game: nothing is listed and
  // nothing fails. The evaluation catalog takes its entry from this function.
  assert.equal(deadEndDashTitles().length, built ? 1 : 0);
  assert.match(
    readFileSync(
      new URL('../examples/catalog-demo/titles.mjs', import.meta.url),
      'utf8',
    ),
    /\.\.\.deadEndDashTitles\(\),/,
  );
});

test(
  'the real build is the pinned source and holds no device, storage or foreign-host access of its own',
  { skip: !built },
  () => {
    const title = deadEndDashOptions();
    validateMetadata(title.metadata);
    const record = JSON.parse(title.titleFiles['build-record.json']);
    assert.equal(record.revision, revision);
    assert.equal(record.sourceUrl, sourceUrl);
    assert.equal(record.sourceDigest, sourceDigest);
    assert.equal(title.manifest.provenance.source.url, sourceUrl);
    assert.match(
      title.titleFiles['OFL-Pixelify-Sans.txt'].toString(),
      /SIL Open Font License/,
    );
    // The host owns the controller, the touch pad and storage. The bundle
    // holds no gamepad polling, no storage, no inline style and nothing of
    // the other page type the game can be published as.
    const bundle = title.titleFiles['title.js'].toString();
    absent(
      bundle,
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bnavigator\.getGamepads\b|createElement\(["']style["']\)|\beval\(|new Function\b|\bclaude\b|RoomTransport/,
      'device, storage or foreign-host access',
    );
    // Every address in the bundle, by its parsed host: only the XML
    // namespaces the DOM needs for the game's drawn icons.
    assert.deepEqual(
      (bundle.match(/https?:\/\/[^\s"'`)]+/g) ?? []).filter(
        (address) => new URL(address).hostname !== 'www.w3.org',
      ),
      [],
      'an outside address',
    );
    absent(bundle, /\/home\/|\/Users\//, 'a local path');
    const page = title.titleFiles['index.html'].toString();
    assert.doesNotMatch(page, /<style|\sstyle=|<script(?![^>]*src=)|\son\w+=/);
    for (const css of ['game.css', 'adapter.css'])
      assert.doesNotMatch(
        title.titleFiles[css].toString(),
        /url\(|@import|@font-face/,
      );
    // The built file is the committed one, byte for byte.
    assert.equal(
      title.titleFiles['network-config.js'].toString(),
      readFileSync(
        new URL(
          '../packages/dead-end-dash/src/network-config.js',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  },
);
