// Optional integration checks against locally built artifacts. No cloud calls or publication.
// Build client and server first; node packages/bubblekick/verify-runtime.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import {
  createWorld,
  step,
} from '../../dist/bubblekick-server/shared/sim/world.js';
import {
  packSnapshot,
  sanitizeSettings,
} from '../../dist/bubblekick-server/shared/protocol.js';
import { OnlineSession } from '../../dist/bubblekick/game--sessions.js';
import { attachGameServer } from '../../dist/bubblekick-server/server/net.js';
// Exercise the real patched simulation, not only the flight-time calculation.
const serverActions =
  await import('../../dist/bubblekick-server/shared/sim/actions.js');
const clientWorld = await import('../../dist/bubblekick/shared--sim--world.js');
const clientActions =
  await import('../../dist/bubblekick/shared--sim--actions.js');
for (const [create, tick, actions] of [
  [createWorld, step, serverActions],
  [clientWorld.createWorld, clientWorld.step, clientActions],
]) {
  for (const distance of [6, 18, 30, 50]) {
    const w = create({
      seed: 8,
      settings: { bots: false },
      humans: [
        { team: 0, char: 0 },
        { team: 0, char: 1 },
        { team: 1, char: 0 },
      ],
    });
    w.phase = 'play';
    w.pt = 0;
    const passer = w.players[w.humans[0].player],
      receiver = w.players[w.humans[1].player];
    Object.assign(passer, { x: -25, z: -7, vx: 0, vz: 0, fx: 1, fz: 0 });
    Object.assign(receiver, { x: -25 + distance, z: -7, vx: 0, vz: 0 });
    Object.assign(w.players[w.humans[2].player], { x: 0, z: 15 });
    Object.assign(w.ball, {
      owner: passer.id,
      x: -23.5,
      y: 0.48,
      z: -7,
      vx: 0,
      vy: 0,
      vz: 0,
    });
    assert(actions.doPass(w, passer, 1, 0, false, receiver.id));
    let ticks = 0;
    while (w.ball.owner !== receiver.id && ticks++ < 60)
      tick(
        w,
        w.humans.map(() => ({ mx: 0, mz: 0, bits: 0 })),
      );
    assert.equal(
      w.ball.owner,
      receiver.id,
      `pass did not reach receiver at ${distance}`,
    );
    assert(ticks < 60, `pass too slow at ${distance}`);
  }
}
// Both runtimes must score with powerful shots without skipping player contacts.
for (const [create, tick, actions] of [
  [createWorld, step, serverActions],
  [clientWorld.createWorld, clientWorld.step, clientActions],
]) {
  for (const char of [0, 1, 2, 3, 4, 5])
    for (const charge of [0, 0.5, 1]) {
      const w = create({
        settings: { bots: false },
        humans: [
          { team: 0, char },
          { team: 1, char: 0 },
        ],
      });
      w.phase = 'play';
      const p = w.players[3],
        defender = w.players[8];
      Object.assign(p, { x: 0, z: 0, fx: 1, fz: 0 });
      Object.assign(defender, { x: 0, z: 15 });
      Object.assign(w.ball, { owner: 3, x: 1.5, y: 0.48, z: 0 });
      assert(actions.doShot(w, p, 1, 0, charge, true));
      const speed = Math.hypot(w.ball.vx, w.ball.vz);
      assert(speed >= (charge === 0 ? 30 : 40), 'shot lacks punch');
      let ticks = 0;
      while (w.phase === 'play' && ticks++ < 180) tick(w, [{}, {}]);
      assert.equal(
        w.score[0],
        1,
        `shot failed to reach goal: char ${char}, charge ${charge}`,
      );
      assert(
        ticks < (charge === 0 ? 150 : 80),
        'shot took too long to reach goal',
      );
    }
  const blocked = create({
    settings: { bots: false },
    humans: [{ team: 0, char: 2 }, { team: 1 }],
  });
  blocked.phase = 'play';
  Object.assign(blocked.players[3], { x: 0, z: 0 });
  Object.assign(blocked.players[8], { x: 10, z: 0 });
  Object.assign(blocked.ball, { owner: 3, x: 1.5, y: 0.48, z: 0 });
  actions.doShot(blocked, blocked.players[3], 1, 0, 1, true);
  let touched = false;
  for (let i = 0; i < 30; i++) {
    tick(blocked, [{}, {}]);
    if (blocked.ball.lastTouch === 8) touched = true;
  }
  assert(touched, 'powerful shots must not tunnel through defenders');
  // Holding charges the shot; releasing fires it exactly once.
  const w = create({ settings: { bots: false }, humans: [{ team: 0 }] });
  w.phase = 'play';
  Object.assign(w.players[3], { x: 0, z: 0, fx: 1, fz: 0 });
  Object.assign(w.ball, { owner: 3, x: 1.5, y: 0.48, z: 0 });
  for (let i = 0; i < 15; i++) tick(w, [{ mx: 0, mz: 0, bits: 1 }]);
  assert.equal(w.ball.owner, 3);
  tick(w, [{ mx: 0, mz: 0, bits: 0 }]);
  assert.equal(w.ball.owner, -1);
  assert.equal(w.stats.shots[0], 1);
  for (let i = 0; i < 5; i++) tick(w, [{}]);
  assert.equal(w.stats.shots[0], 1);
}
console.log(
  'PASS stronger shots score for all characters/charge levels, respect defenders, and fire once on release in both runtimes',
);
// Moving receivers are led; defenders can still block the pass.
for (const blocked of [false, true]) {
  const w = createWorld({
    settings: { bots: false },
    humans: [{ team: 0 }, { team: 0 }, { team: 1 }],
  });
  w.phase = 'play';
  const a = w.players[3],
    b = w.players[4],
    defender = w.players[8];
  Object.assign(a, { x: -25, z: -8, fx: 1, fz: 0 });
  Object.assign(b, { x: 5, z: -8, vz: blocked ? 0 : 8 });
  Object.assign(defender, { x: -10, z: blocked ? -8 : 15 });
  Object.assign(w.ball, { owner: 3, x: -23.5, y: 0.48, z: -8 });
  serverActions.doPass(w, a, 1, 0, false, 4);
  let intercepted = false;
  for (let i = 0; i < 60; i++) {
    step(w, [{}, { mx: 0, mz: blocked ? 0 : 1, bits: 0 }, {}]);
    if (w.ball.lastTouch === 8) intercepted = true;
    if (w.ball.owner === 4) break;
  }
  if (blocked) assert(intercepted, 'pass must not bypass a defender');
  else assert.equal(w.ball.owner, 4, 'moving teammate should receive the pass');
}
console.log(
  'PASS short/medium/long passes reach their receiver in under one second in client and server simulation',
);
const humans = [
  { team: 0, char: 0 },
  { team: 1, char: 1 },
];
const world = createWorld({ seed: 42, humans, settings: { bots: false } });
assert.equal(world.players.filter((p) => p.active).length, 2);
assert.equal(world.settings.penalties, false);
const inactive = world.players.filter((p) => !p.active).map((p) => [p.x, p.z]);
for (let i = 0; i < 180; i++)
  step(world, [
    { mx: 1, mz: 0, bits: 4 },
    { mx: 0, mz: 0, bits: 0 },
  ]);
assert.deepEqual(
  world.players.filter((p) => !p.active).map((p) => [p.x, p.z]),
  inactive,
);
assert(world.humans.every((h) => world.players[h.player].active));
assert.equal(
  createWorld({ humans }).players.filter((p) => p.active).length,
  10,
);
assert.equal(sanitizeSettings({ bots: false }).bots, false);
assert.equal(sanitizeSettings({ bots: 'false' }).bots, true);
console.log(
  'PASS bots off removes inactive players from movement/switching; bots on retains full teams',
);
let receive,
  sent = [];
const session = new OnlineSession({
  net: { on: (fn) => ((receive = fn), () => {}), send: (m) => sent.push(m) },
  start: { seed: 42, settings: { bots: false }, humans, you: [0] },
});
const authority = createWorld({ seed: 42, humans, settings: { bots: false } });
authority.phase = 'play';
receive({ ...packSnapshot(authority, []), ack: -1 });
const id = authority.humans[0].player,
  before = authority.players[id].x;
// No reply for 100 ms: movement must already be visible on the first rendered frame.
session.update(1 / 60, () => ({ mx: 1, mz: 0, bits: 0 }));
assert(session.view.players[id].x > before);
for (let i = 0; i < 5; i++)
  session.update(1 / 60, () => ({ mx: 1, mz: 0, bits: 0 }));
assert(session.view.players[id].x > before + 0.1);
// Delayed authoritative correction acknowledges only the first input, replay the other five.
step(authority, [{ mx: 1, mz: 0, bits: 0 }]);
receive({ ...packSnapshot(authority, []), ack: 0 });
assert.equal(session.unacked.length, 5);
assert(session.world.players[id].x > authority.players[id].x);
for (let i = 0; i < 40; i++)
  session.update(1 / 60, () => ({ mx: 1, mz: 0, bits: 0 }));
assert.equal(session.unacked.length, 30); // Do not predict indefinitely during an outage.
receive({ ...packSnapshot(authority, []), ack: 100 });
assert.equal(session.unacked.length, 0);
session.paused = true;
session.update(1 / 60, () => {
  throw Error('Paused input sampled');
});
assert.deepEqual(sent.at(-1).i[0].slice(1), [0, 0, 0]);
console.log(
  'PASS immediate prediction, delayed reconciliation, bounded outage and neutral pause input',
);
const server = createServer();
const wss = attachGameServer(server);
server.on('upgrade', (r, s, h) =>
  wss.handleUpgrade(r, s, h, (ws) => wss.emit('connection', ws, r)),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const clients = [];
async function connect(name, fieldSizes = true) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  await new Promise((r) => ws.on('open', r));
  const send = (m) => ws.send(JSON.stringify(m));
  const wait = async (type) => {
    for (let i = 0; i < 100; i++) {
      const at = msgs.findIndex((m) => m.type === type);
      if (at >= 0) return msgs.splice(at, 1)[0];
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error('Timeout ' + type);
  };
  send({ type: 'hello', v: 1, name, fieldSizes });
  await wait('welcome');
  const c = { ws, msgs, send, wait };
  clients.push(c);
  return c;
}
try {
  const a = await connect('Host'),
    b = await connect('Guest');
  a.send({ type: 'create' });
  const room = await a.wait('room');
  b.send({ type: 'join', code: room.code.toLowerCase() });
  await b.wait('room');
  a.send({ type: 'seats', seats: [{ team: 0, char: 0 }] });
  b.send({ type: 'seats', seats: [{ team: 1, char: 1 }] });
  a.send({ type: 'settings', bots: false, minutes: 1, fieldSize: 'large' });
  await new Promise((r) => setTimeout(r, 100));
  // Non-host cannot start or change the bot policy.
  b.send({ type: 'settings', bots: true, fieldSize: 'standard' });
  b.send({ type: 'start' });
  await new Promise((r) => setTimeout(r, 100));
  assert(!a.msgs.some((m) => m.type === 'start'));
  // Four players per side maximum, even a malformed client cannot overwrite the same player slot.
  b.send({
    type: 'seats',
    seats: Array.from({ length: 4 }, () => ({ team: 0, char: 0 })),
  });
  assert.equal((await b.wait('error')).code, 'team_full');
  const legacy = await connect('Old tab', false);
  legacy.send({ type: 'join', code: room.code });
  assert.equal((await legacy.wait('error')).code, 'update');
  legacy.send({ type: 'create' });
  await legacy.wait('room');
  legacy.send({ type: 'settings', fieldSize: 'large' });
  assert.equal((await legacy.wait('error')).code, 'update');
  a.send({ type: 'start' });
  const start = await a.wait('start');
  assert.equal(start.settings.bots, false);
  assert.equal(start.settings.fieldSize, 'large');
  assert.equal((await b.wait('start')).settings.fieldSize, 'large');
  a.send({ type: 'in', s: 7, i: [[0, 127, 0, 0]] });
  let snap;
  do {
    snap = await a.wait('snap');
  } while (snap.ack !== 7);
  assert.equal(snap.movement.length, 10);
  b.send({ type: 'settings', bots: true, fieldSize: 'standard' });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(start.settings.bots, false);
  console.log(
    'PASS typed join, host-only settings/start, team capacity and per-client input acknowledgments',
  );
} finally {
  for (const c of clients) c.ws.close();
  await new Promise((r) => setTimeout(r, 50));
  wss.close();
  server.close();
}
