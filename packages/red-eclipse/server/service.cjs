'use strict';
const http = require('node:http'),
  dgram = require('node:dgram'),
  { spawn } = require('node:child_process');
const { WebSocketServer, WebSocket } = require('ws');
const { allowedOrigins, upgradeAllowed } = require('./policy.cjs');
const origins = allowedOrigins(process.env.ALLOWED_ORIGINS);
const { Rooms, normalizeCode } = require('./rooms.cjs');
const { mkdtemp, copyFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
let stopping = false;
const rooms = new Rooms({
  launch: async (room, onExit) => {
    const home = await mkdtemp(join(tmpdir(), 'akeru-room-'));
    try {
      await copyFile(
        '/app/runtime/home/servinit.cfg',
        join(home, 'servinit.cfg'),
      );
    } catch (error) {
      onExit();
      await rm(home, { recursive: true, force: true });
      throw error;
    }
    // All destinations are server-assigned local ports, never request-controlled.
    const child = spawn(
      '/app/redeclipse-server',
      ['-h' + home, '-si127.0.0.1', '-sp' + room.port, '-ss1', '-sm'],
      { cwd: '/app/runtime', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const cleanup = () => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
    };
    child.once('close', () => {
      onExit();
      void rm(home, { recursive: true, force: true });
    });
    try {
      await new Promise((resolve, reject) => {
        let tail = '';
        const timeout = setTimeout(() => {
          cleanup();
          reject(Error('Room startup timed out'));
        }, 20000);
        const done = (error) => {
          clearTimeout(timeout);
          error ? reject(error) : resolve();
        };
        child.once('error', done);
        child.once('exit', () => done(Error('Room server stopped')));
        child.stdout.on('data', (bytes) => {
          tail = (tail + bytes.toString()).slice(-2048);
          if (tail.includes('server started')) done();
        });
        // Never log room credentials or arbitrary player text.
        child.stderr.on('data', () => {});
      });
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  },
});
const sweep = setInterval(() => rooms.sweep(), 30000);
sweep.unref();
let budget = 40,
  budgetAt = Date.now();
const result = (res, status, value) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  if (req.url === '/ready')
    return result(res, stopping ? 503 : 200, {
      ready: !stopping,
      service: 'akeru-red-eclipse',
      privateRooms: true,
    });
  if (!origins.has(req.headers.origin))
    return result(res, 403, { error: 'Origin not allowed' });
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Vary', 'Origin');
  if (
    req.method === 'OPTIONS' &&
    ['/rooms', '/rooms/join', '/rooms/close'].includes(req.url)
  ) {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    return res.end();
  }
  if (
    stopping ||
    req.method !== 'POST' ||
    !['/rooms', '/rooms/join', '/rooms/close'].includes(req.url)
  )
    return result(res, 404, { error: 'Not found' });
  const now = Date.now();
  budget = Math.min(40, budget + (now - budgetAt) / 1000);
  budgetAt = now;
  if (--budget < 0)
    return result(res, 429, {
      error: 'Too many attempts. Wait a moment and try again.',
    });
  if (req.headers['content-type'] !== 'application/json')
    return result(res, 415, { error: 'JSON required' });
  req.setTimeout(5000, () => req.destroy());
  try {
    let text = '';
    for await (const bytes of req) {
      text += bytes;
      if (text.length > 2048)
        return result(res, 413, { error: 'Request too large' });
    }
    req.setTimeout(0);
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return result(res, 400, { error: 'Invalid request' });
    if (req.url === '/rooms/close') {
      const room = rooms.rooms.get(normalizeCode(data.code));
      if (!room?.ready)
        return result(res, 404, { error: 'Room not found or expired' });
      if (typeof data.owner !== 'string' || data.owner !== room.owner)
        return result(res, 403, {
          error: 'Only the room creator can close it',
        });
      rooms.destroy(room);
      return result(res, 200, { closed: true });
    }
    const room =
      req.url === '/rooms' ? await rooms.create() : rooms.join(data.code);
    return result(res, req.url === '/rooms' ? 201 : 200, {
      code: room.code,
      token: room.token,
      ...(req.url === '/rooms' ? { owner: room.owner } : {}),
      capacity: 8,
      players: room.clients.size,
    });
  } catch (error) {
    result(res, error.status || 400, {
      error: error.status
        ? error.message
        : 'Could not open the room. Please try again.',
    });
  }
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 65507,
  perMessageDeflate: false,
  handleProtocols: (p) => (p.has('binary') ? 'binary' : false),
});
server.on('upgrade', (req, socket, head) => {
  if (
    !upgradeAllowed(
      {
        ready: !stopping,
        path: req.url,
        origin: req.headers.origin,
        clients: 0,
      },
      origins,
    )
  ) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  const protocols = String(req.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((p) => p.trim());
  const room = rooms.authorize(
    protocols.find((p) => p.startsWith('room.'))?.slice(5),
  );
  if (!protocols.includes('binary') || !room) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    room.clients.add(ws);
    wss.emit('connection', ws, room);
  });
});
wss.on('connection', (ws, room) => {
  ws.on('close', () => {
    room.clients.delete(ws);
    room.touched = Date.now();
  });
  const udp = dgram.createSocket('udp4');
  let bound = false,
    closed = false,
    first = true,
    tokens = 1000,
    stamp = Date.now(),
    bytesBudget = 2097152,
    alive = true;
  const pending = [];
  const end = () => {
    if (closed) return;
    closed = true;
    pending.length = 0;
    try {
      udp.close();
    } catch {
      // A rejected or already-closed UDP socket needs no second close.
    }
    ws.terminate();
  };
  udp.on('error', end);
  ws.on('error', end);
  ws.on('close', end);
  ws.on('pong', () => (alive = true));
  udp.on('message', (bytes) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1048576) return end();
    ws.send(bytes, { binary: true });
  });
  udp.bind(0, '127.0.0.1', () =>
    udp.connect(room.port, '127.0.0.1', () => {
      bound = true;
      for (const b of pending.splice(0)) udp.send(b);
    }),
  );
  ws.on('message', (bytes, binary) => {
    if (!binary || !bytes.length) return end();
    if (first) {
      first = false;
      if (
        bytes.length === 10 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([255, 255, 255, 255, 112, 111, 114, 116]))
      )
        return;
    }
    const now = Date.now(),
      delta = now - stamp;
    stamp = now;
    tokens = Math.min(1000, tokens + delta * 0.5);
    bytesBudget = Math.min(2097152, bytesBudget + delta * 1048);
    if (
      --tokens < 0 ||
      (bytesBudget -= bytes.length) < 0 ||
      pending.length >= 32
    )
      return end();
    if (bound) udp.send(bytes);
    else pending.push(Buffer.from(bytes));
  });
  const timer = setInterval(() => {
    if (!alive) return end();
    alive = false;
    ws.ping();
  }, 30000);
  timer.unref();
  ws.on('close', () => clearInterval(timer));
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => {
  stopping = true;
  for (const ws of wss.clients) ws.close(1012, 'Server restarting');
  rooms.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
