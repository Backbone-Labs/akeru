import { createLocalNetwork } from './local-network.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { creatorTitles } from './titles.mjs';
const titles = creatorTitles();
for (const title of titles) {
  const key = {
    'westwick-manor': 'AKERU_MANOR_SERVER_PORT',
    'mythic-kitchen': 'AKERU_KITCHEN_SERVER_PORT',
  }[title.manifest.id];
  if (key && process.env[key])
    title.upgrade = createLocalNetwork(Number(process.env[key]));
}
if (!titles.length) throw new Error('Build the creator titles first');
const demo = await startCatalogDemo({
  titles,
  shellPort: Number(process.env.AKERU_PREVIEW_PORT ?? 0),
});
console.log(demo.url + '/games');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await demo.close();
    process.exit(0);
  });
