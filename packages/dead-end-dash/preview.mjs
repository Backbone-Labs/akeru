import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { deadEndDashOptions, withLocalRelay } from './catalog.mjs';

// Parties are opt-in: only an explicitly named loopback relay is bridged.
const relayPort = process.env.AKERU_DEAD_END_DASH_RELAY_PORT;
const title = relayPort
  ? withLocalRelay(deadEndDashOptions(), Number(relayPort))
  : deadEndDashOptions();
const demo = await startCatalogDemo({
  titles: [title],
  shellPort: Number(process.env.AKERU_PREVIEW_PORT ?? 0),
});
console.log(demo.url + '/play/dead-end-dash');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await demo.close();
    process.exit(0);
  });
