import http from 'node:http';
import { attachGameServer } from './net.js';
import { originSet, allowUpgrade } from './policy.mjs';
const allowed = originSet(process.env.ALLOWED_ORIGINS || '');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(req.method === 'GET' && ['/healthz', '/ready'].includes(req.url) ? 200 : 404);
  res.end(
    JSON.stringify(
      ['/healthz', '/ready'].includes(req.url)
        ? { ok: true, game: 'bubblekick' }
        : { error: 'not-found' },
    ),
  );
});
const wss = attachGameServer(server);
let attempts = { start: Date.now(), count: 0 };
server.on('upgrade', (req, socket, head) => {
  const now = Date.now();
  if (now - attempts.start > 60000) attempts = { start: now, count: 0 };
  attempts.count++;
  if (!allowUpgrade(req, allowed, wss.clients.size) || attempts.count > 300) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  console.log(
    JSON.stringify({
      event: 'connections',
      game: 'bubblekick',
      connections: wss.clients.size,
    }),
  );
}, 30000);
heartbeat.unref();
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  const connectedAt = Date.now();
  ws.on('close', () =>
    console.log(
      JSON.stringify({
        event: 'connection_ended',
        game: 'bubblekick',
        durationSeconds: Math.round((Date.now() - connectedAt) / 1000),
      }),
    ),
  );
});
process.once('SIGTERM', () => {
  clearInterval(heartbeat);
  server.close();
  for (const ws of wss.clients)
    ws.close(1012, 'Server restarting. Rejoin from the lobby.');
  setTimeout(() => process.exit(0), 1200).unref();
});
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0', () =>
  console.log(JSON.stringify({ event: 'ready', game: 'bubblekick' })),
);
