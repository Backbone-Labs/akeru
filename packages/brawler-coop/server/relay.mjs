/** Ephemeral, room-scoped transport. No account credentials or persistent storage. */
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () =>
  Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    '',
  );
export function createRelay({
  origins = [],
  maxRooms = 24,
  maxConnections = 120,
  roomLifetimeMs = 45 * 60 * 1000,
  idleMs = 60000,
} = {}) {
  const rooms = new Map(),
    clients = new Set(),
    attempts = new Map();
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(req.url === '/healthz' ? 200 : 404);
    res.end(
      JSON.stringify(
        req.url === '/healthz' ? { ok: true } : { error: 'not-found' },
      ),
    );
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 65548,
    perMessageDeflate: false,
  });
  const send = (ws, value) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  };
  const fail = (ws, message) => {
    send(ws, { type: 'error', message });
    ws.close(1008, 'Room unavailable');
  };
  function remove(ws) {
    clients.delete(ws);
    const room = ws.room;
    if (!room) return;
    ws.room = null;
    room.members.delete(ws.id);
    if (ws.id === 1) {
      rooms.delete(room.code);
      for (const other of room.members.values()) {
        other.room = null;
        send(other, {
          type: 'ended',
          message: 'The host left. Create or join a new room.',
        });
        other.close(1000, 'Host left');
      }
      room.members.clear();
    } else {
      for (const other of room.members.values())
        send(other, { type: 'left', id: ws.id });
    }
  }
  server.on('upgrade', (req, socket, head) => {
    if (
      req.url !== '/relay' ||
      !origins.includes(req.headers.origin) ||
      clients.size >= maxConnections
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    // Cloud Run's proxy appends the client/proxy hops; never use a client-supplied first hop.
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((x) => x.trim());
    const ip =
      forwarded.length >= 2 ? forwarded.at(-2) : req.socket.remoteAddress;
    const now = Date.now(),
      prior = attempts.get(ip);
    const rate =
      prior && now - prior.time < 60000 ? prior : { time: now, count: 0 };
    rate.count++;
    attempts.set(ip, rate);
    if (rate.count > 40) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.last = Date.now();
    ws.opened = Date.now();
    ws.windowStart = Date.now();
    ws.packets = 0;
    ws.bytes = 0;
    ws.id = 0;
    ws.on('error', () => {});
    ws.on('close', () => remove(ws));
    ws.on('message', (data, binary) => {
      const now = Date.now();
      ws.last = now;
      if (now - ws.windowStart >= 1000) {
        ws.windowStart = now;
        ws.packets = 0;
        ws.bytes = 0;
      }
      if (++ws.packets > 5000 || (ws.bytes += data.length) > 2 * 1024 * 1024)
        return fail(ws, 'Connection limit reached. Please reconnect.');
      if (binary) {
        const room = ws.room;
        if (!room || data.length < 13 || data.length > 65548)
          return fail(ws, 'Invalid game packet.');
        const target = data.readInt32LE(0),
          channel = data.readUInt32LE(4),
          mode = data.readUInt32LE(8);
        if (mode > 2 || channel > 31 || Math.abs(target) > 4)
          return fail(ws, 'Invalid game packet.');
        // The sender identity comes from this socket, never from client data.
        const packet = Buffer.from(data);
        packet.writeInt32LE(ws.id, 0);
        for (const [id, other] of room.members) {
          if (
            id === ws.id ||
            !(target === 0 || target === id || (target < 0 && id !== -target))
          )
            continue;
          if (other.bufferedAmount > 2 * 1024 * 1024) {
            fail(other, 'Connection too slow. Rejoin a new room.');
            continue;
          }
          if (other.readyState === WebSocket.OPEN) other.send(packet);
        }
        return;
      }
      if (data.length > 1024) return fail(ws, 'Invalid room request.');
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return fail(ws, 'Invalid room request.');
      }
      if (!m || typeof m !== 'object' || Array.isArray(m))
        return fail(ws, 'Invalid room request.');
      if (m.type === 'ping') return send(ws, { type: 'pong' });
      if (m.type === 'lock' && ws.room && ws.id === 1) {
        ws.room.locked = Boolean(m.locked);
        return;
      }
      if (
        m.type === 'kick' &&
        ws.room &&
        ws.id === 1 &&
        Number.isInteger(m.id) &&
        m.id > 1
      ) {
        ws.room.members.get(m.id)?.close(1000, 'Left room');
        return;
      }
      if (ws.room || !['create', 'join'].includes(m.type))
        return fail(ws, 'Invalid room request.');
      let room;
      if (m.type === 'create') {
        if (rooms.size >= maxRooms)
          return fail(ws, 'Rooms are full. Try again shortly.');
        let roomCode;
        do {
          roomCode = code();
        } while (rooms.has(roomCode));
        room = {
          code: roomCode,
          members: new Map(),
          next: 2,
          created: now,
          locked: false,
        };
        rooms.set(roomCode, room);
        ws.id = 1;
      } else {
        if (typeof m.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(m.code))
          return fail(ws, 'Enter a six-character room code.');
        room = rooms.get(m.code);
        if (!room)
          return fail(
            ws,
            'Room not found. Check the code or create a new room.',
          );
        if (room.locked)
          return fail(
            ws,
            'This match has started. Ask the host to create a new room.',
          );
        if (
          room.members.size >= 4 ||
          ![2, 3, 4].some((id) => !room.members.has(id))
        )
          return fail(ws, 'This room is full. Create a new room.');
        ws.id = [2, 3, 4].find((id) => !room.members.has(id));
      }
      const peers = [...room.members.keys()];
      ws.room = room;
      room.members.set(ws.id, ws);
      send(ws, { type: 'welcome', id: ws.id, code: room.code, peers });
      for (const id of peers)
        send(room.members.get(id), { type: 'joined', id: ws.id });
    });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, rate] of attempts)
      if (now - rate.time > 60000) attempts.delete(ip);
    for (const ws of clients)
      if (now - ws.last > idleMs || (!ws.room && now - ws.opened > 10000)) {
        ws.close(1000, 'Connection expired');
        remove(ws);
      }
    for (const room of rooms.values())
      if (now - room.created > roomLifetimeMs) {
        for (const ws of [...room.members.values()]) {
          send(ws, {
            type: 'ended',
            message: 'This room expired. Create a new room to keep playing.',
          });
          ws.close(1000, 'Room expired');
          remove(ws);
        }
      }
  }, 1000);
  timer.unref();
  return {
    server,
    rooms,
    async close() {
      clearInterval(timer);
      for (const ws of clients) ws.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    },
  };
}
