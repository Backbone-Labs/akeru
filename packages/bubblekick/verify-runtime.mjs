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
async function connect(name) {
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
  send({ type: 'hello', v: 1, name });
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
  a.send({ type: 'settings', bots: false, minutes: 1 });
  await new Promise((r) => setTimeout(r, 100));
  // Non-host cannot start or change the bot policy.
  b.send({ type: 'settings', bots: true });
  b.send({ type: 'start' });
  await new Promise((r) => setTimeout(r, 100));
  assert(!a.msgs.some((m) => m.type === 'start'));
  // Four players per side maximum, even a malformed client cannot overwrite the same player slot.
  b.send({
    type: 'seats',
    seats: Array.from({ length: 4 }, () => ({ team: 0, char: 0 })),
  });
  assert.equal((await b.wait('error')).code, 'team_full');
  a.send({ type: 'start' });
  const start = await a.wait('start');
  assert.equal(start.settings.bots, false);
  await b.wait('start');
  a.send({ type: 'in', s: 7, i: [[0, 127, 0, 0]] });
  let snap;
  do {
    snap = await a.wait('snap');
  } while (snap.ack !== 7);
  assert.equal(snap.movement.length, 10);
  b.send({ type: 'settings', bots: true });
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
