import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { isoCityOptions } from './catalog.mjs';
const demo = await startCatalogDemo({ titles: [isoCityOptions()] });
console.log(demo.url);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await demo.close();
    process.exit(0);
  });
