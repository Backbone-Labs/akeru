import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { freedoomOptions } from './catalog.mjs';
const preview = await startCatalogDemo(
  freedoomOptions(process.argv[2] || 'freedoom1'),
);
console.log(preview.url);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
