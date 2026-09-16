/** Explicit local evaluation catalog; never a production publication source. */
import { startCatalogDemo } from './server.mjs';
import { playableTitles } from './titles.mjs';

const preview = await startCatalogDemo({ titles: playableTitles() });
console.log(preview.url);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
}
