/** Explicit local evaluation catalog; never a production publication source. */
import { startCatalogDemo } from './server.mjs';
import { anarchOptions } from '../../packages/anarch/preview.mjs';
import { puzzleOptions } from '../../packages/puzzle-preview/catalog.mjs';

const preview = await startCatalogDemo({
  titles: [anarchOptions(), puzzleOptions('2048'), puzzleOptions('hextris')],
});
console.log(preview.url);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
}
