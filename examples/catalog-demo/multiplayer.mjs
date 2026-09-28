/** Explicit local multiplayer evaluation. Does not publish or activate a title. */
import { startCatalogDemo } from './server.mjs';
import { options } from '../../packages/old-san-juan-kart/catalog.mjs';
import { startKartServer } from '../../packages/old-san-juan-kart/multiplayer/server.mjs';
const publicHost = process.env.AKERU_LAN_HOST || '127.0.0.1';
if (
  !/^(127\.0\.0\.1|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2[0-9]|3[01])\.[\d.]+)$/.test(
    publicHost,
  )
)
  throw Error('Use a private LAN IPv4 address');
const bindHost = publicHost === '127.0.0.1' ? publicHost : '0.0.0.0';
const origins = [];
const worker = await startKartServer({
  host: bindHost,
  origins,
  allowHeadless: true,
});
const preview = await startCatalogDemo({
  titles: [options({ multiplayer: true })],
  publicHost,
  bindHost,
  multiplayerEndpoint: `http://${publicHost}:${worker.port}`,
});
origins.push(preview.url);
console.log(`Open on both devices: ${preview.url}/play/old-san-juan-kart`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await preview.close();
    await worker.close();
    process.exit(0);
  });
