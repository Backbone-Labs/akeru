'use strict';
const http = require('node:http'),
  dgram = require('node:dgram'),
  { spawn } = require('node:child_process');
const { WebSocketServer, WebSocket } = require('ws');
const { allowedOrigins, upgradeAllowed } = require('./policy.cjs');
const origins = allowedOrigins(process.env.ALLOWED_ORIGINS);
let stopping = false,
  ready = false;
const child = spawn(
  '/app/redeclipse-server',
  ['-h/app/runtime/home', '-si127.0.0.1', '-sp28700', '-ss1', '-sm'],
  { cwd: '/app/runtime', stdio: ['ignore', 'pipe', 'pipe'] },
);
child.stdout.on('data', (b) => {
  process.stdout.write(b);
  if (b.toString().includes('server started')) ready = true;
});
child.stderr.pipe(process.stderr);
child.on('exit', (code) => {
  ready = false;
  if (!stopping) process.exit(code || 1);
});
const server = http.createServer((req, res) => {
  if (req.url === '/ready') {
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ready,
        service: 'akeru-red-eclipse',
        revision: 'faf378d12558addc700d0e464e7e8c3a39fbceee',
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
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
        ready,
        path: req.url,
        origin: req.headers.origin,
        clients: wss.clients.size,
      },
      origins,
    )
  ) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (ws) => {
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
    udp.connect(28700, '127.0.0.1', () => {
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
  child.kill('SIGTERM');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
