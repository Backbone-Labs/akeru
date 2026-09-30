import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { brawlerOptions } from './catalog.mjs';
const preview = await startCatalogDemo(brawlerOptions());
console.log(preview.url + '/play/brawler-coop');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
