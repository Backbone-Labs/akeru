import WebSocket from 'ws';
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:4325/ws',
  origin =
    process.argv[3] ||
    'https://backbone-akeru-games-b3akljzqe-backbone-labs.vercel.app';
async function client(o = origin) {
  const ws = new WebSocket(url, { origin: o }),
    messages = [];
  ws.on('message', (d) => messages.push(JSON.parse(d)));
  await new Promise((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async next(pred) {
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        const i = messages.findIndex(pred);
        if (i >= 0) return messages.splice(i, 1)[0];
        await new Promise((r) => setTimeout(r, 25));
      }
      throw Error('Message timeout');
    },
  };
}
let bad = false;
try {
  const x = await client('https://untrusted.example');
  x.ws.terminate();
} catch {
  bad = true;
}
assert.ok(bad, 'foreign Origin rejected');
const a = await client(),
  b = await client(),
  c = await client();
try {
  for (const [i, x] of [a, b, c].entries()) {
    x.send({ type: 'hello', v: 1, name: 'QA ' + i });
  }
  for (const x of [a, b, c]) await x.next((m) => m.type === 'welcome');
  a.send({ type: 'create' });
  const room = await a.next((m) => m.type === 'room');
  b.send({ type: 'join', code: room.code });
  await b.next((m) => m.type === 'room' && m.members.length === 2);
  c.send({ type: 'create' });
  const other = await c.next((m) => m.type === 'room');
  assert.notEqual(other.code, room.code);
  a.send({ type: 'seats', seats: [{ team: 0, char: 0, ready: true }] });
  b.send({ type: 'seats', seats: [{ team: 1, char: 1, ready: true }] });
  await a.next(
    (m) => m.type === 'room' && m.members.every((x) => x.seats.length === 1),
  );
  b.send({ type: 'start' });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!a.messages.some((m) => m.type === 'start'), 'only host starts');
  a.send({ type: 'start' });
  const sa = await a.next((m) => m.type === 'start'),
    sb = await b.next((m) => m.type === 'start');
  assert.equal(sa.humans.length, 2);
  assert.equal(sb.humans.length, 2);
  assert.notDeepEqual(sa.you, sb.you);
  let timer = setInterval(
    () => b.send({ type: 'in', i: [[0, -127, 0, 0]] }),
    50,
  );
  await new Promise((r) => setTimeout(r, 3000));
  clearInterval(timer);
  const snap = await a.next((m) => m.type === 'snap' && m.t > 150);
  assert.ok(snap.p.length === 90);
  assert.ok(!c.messages.some((m) => m.type === 'snap'), 'rooms isolated');
  b.ws.close();
  await a.next((m) => m.type === 'room' && m.members.length === 1);
  console.log(
    'PASS: Origin rejection, two players, host-only start, snapshots, isolated room, disconnect cleanup',
  );
} finally {
  for (const x of [a, b, c]) x.ws.close();
  setTimeout(() => {
    for (const x of [a, b, c]) x.ws.terminate();
  }, 300).unref();
}
