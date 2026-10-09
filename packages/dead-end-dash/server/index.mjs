/** Dead End Dash's party relay as a service: a health check, one WebSocket
 * path, and nothing else. The relay is the game's own `relay-core.mjs`, which
 * `build-server.mjs` copies from the pinned commit and places beside this
 * file; it is not part of this repository, so this entry runs only from the
 * built runtime. Nothing here serves a file or reads one. */
import http from 'node:http';
import { addressOptions, createRelay, parseHops } from './relay-core.mjs';
import { admit, limits, parseOrigins } from './policy.mjs';

const origins = parseOrigins(process.env.TITLE_ORIGINS);
// Where a player's address is, counted in proxies. Unset, the relay runs
// without its per-address limits rather than mistake a proxy for a player.
const hops = parseHops(process.env.FORWARDED_HOPS);
const relay = createRelay({ ...limits, ...addressOptions(hops) });

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  if (!admit(req, origins)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  relay.handleUpgrade(req, socket, head);
});

server.listen(Number(process.env.PORT || 8080), process.env.HOST, () => {
  console.log(
    `Dead End Dash party relay on http://localhost:${server.address().port}`,
  );
  if (hops === null)
    console.log('Per-address limits are off: FORWARDED_HOPS is not set.');
});

// The relay holds no game state: the players do. A restart ends connections,
// not parties; the title reconnects and the room forms again.
process.once('SIGTERM', () => {
  relay.close(1012, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
