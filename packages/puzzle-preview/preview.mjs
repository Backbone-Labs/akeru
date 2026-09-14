import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { puzzleOptions } from './catalog.mjs';
const demo = await startCatalogDemo({
  titles: ['2048', 'hextris'].map(puzzleOptions),
});
console.log(demo.url);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await demo.close();
    process.exit(0);
  });
