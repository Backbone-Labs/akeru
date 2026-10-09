import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { KartRoom } from './room.mjs';
import { ROOM_NAME } from './protocol.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export async function startKartServer({
  port = 0,
  host = '127.0.0.1',
  origins = [],
  allowHeadless = false,
  redisUrl,
  publicAddress,
} = {}) {
  if (!origins.length && !allowHeadless)
    throw Error('Explicit shell origins are required');
  if (redisUrl && !publicAddress)
    throw Error('Redis workers require a routable publicAddress');
  const allowed = (origin) =>
    origins.includes(origin) || (!origin && allowHeadless);
  const transport = new WebSocketTransport({
    maxPayload: 4096,
    beforeUpgrade: (request) => {
      if (!allowed(request.headers.get('origin')))
        return new Response(null, { status: 403 });
    },
  });
  let scaling = {};
  if (redisUrl) {
    const { RedisPresence } = await import('@colyseus/redis-presence');
    const { RedisDriver } = await import('@colyseus/redis-driver');
    scaling = {
      presence: new RedisPresence(redisUrl),
      driver: new RedisDriver(redisUrl),
      publicAddress,
    };
  }
  const limits = new Map();
  const server = new Server({
    transport,
    ...scaling,
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, KartRoom);
  await server.listen(port, host);
  // Guard the transport itself: Colyseus's router precedes Express middleware.
  const handlers = transport.server.listeners('request');
  transport.server.removeAllListeners('request');
  transport.server.on('request', (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      return res.end('ok');
    }
    if (!allowed(req.headers.origin)) {
      res.writeHead(403);
      return res.end();
    }
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.writeHead(204);
      return res.end();
    }
    const now = Date.now();
    for (const [key, value] of limits)
      if (now > value.until) limits.delete(key);
    const key = req.socket.remoteAddress;
    const limit = limits.get(key) ?? { until: now + 60000, count: 0 };
    limits.set(key, limit);
    if (++limit.count > 60 || limits.size > 10000) {
      res.writeHead(429);
      return res.end();
    }
    if (
      req.method !== 'POST' ||
      !/^\/matchmake\/(create|joinById|reconnect)\/[a-zA-Z0-9_-]+$/.test(
        req.url,
      )
    ) {
      res.writeHead(404);
      return res.end();
    }
    const size = Number(req.headers['content-length']);
    if (!Number.isInteger(size) || size < 0 || size > 4096) {
      res.writeHead(413);
      return res.end();
    }
    for (const handler of handlers) handler.call(transport.server, req, res);
  });
  return {
    server,
    port: transport.server.address().port,
    close: () => server.gracefullyShutdown(false),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const worker = await startKartServer({
    port: Number(process.env.PORT || 2567),
    host: process.env.HOST || '127.0.0.1',
    origins: (process.env.SHELL_ORIGINS || '').split(',').filter(Boolean),
    redisUrl: process.env.REDIS_URL,
    publicAddress: process.env.PUBLIC_ADDRESS,
  });
  console.log(`Kart worker listening on ${worker.port}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await worker.close();
      process.exit(0);
    });
}
