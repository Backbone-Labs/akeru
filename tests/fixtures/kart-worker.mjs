/** Isolated process fixture for Redis-backed room routing. */
import { startKartServer } from '../../packages/old-san-juan-kart/multiplayer/server.mjs';
const port = Number(process.env.KART_TEST_PORT);
const worker = await startKartServer({
  port,
  allowHeadless: true,
  redisUrl: process.env.KART_TEST_REDIS_URL,
  publicAddress: `127.0.0.1:${port}`,
});
process.send('ready');
process.on('message', async () => {
  await worker.close();
  process.exit(0);
});
