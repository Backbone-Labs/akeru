/** Isolated process fixture for Redis-backed room routing. */
import { startBlacklineServer } from '../../packages/operation-blackline/multiplayer/server.mjs';
const port = Number(process.env.BLACKLINE_TEST_PORT);
const worker = await startBlacklineServer({
  port,
  allowHeadless: true,
  redisUrl: process.env.BLACKLINE_TEST_REDIS_URL,
  publicAddress: `127.0.0.1:${port}`,
});
process.send('ready');
process.on('message', async () => {
  await worker.close();
  process.exit(0);
});
