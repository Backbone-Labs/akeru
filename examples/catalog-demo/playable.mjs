/** Explicit local evaluation catalog; never a production publication source. */
import { startCatalogDemo } from './server.mjs';
import { playableTitles } from './titles.mjs';

const preview = await startCatalogDemo({
  titles: playableTitles(),
  shellPort: Number(process.env.AKERU_PREVIEW_PORT ?? 0),
});
console.log(preview.url);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
}
