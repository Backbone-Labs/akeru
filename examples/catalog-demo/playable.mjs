/** Explicit local evaluation catalog; never a production publication source. */
import { startCatalogDemo } from './server.mjs';
import { anarchOptions } from '../../packages/anarch/preview.mjs';
import { puzzleOptions } from '../../packages/puzzle-preview/catalog.mjs';

import { serverSurvivalOptions } from '../../packages/server-survival/catalog.mjs';
import { isoCityOptions } from '../../packages/isocity/catalog.mjs';
import { whatajongOptions } from '../../packages/whatajong/catalog.mjs';

const preview = await startCatalogDemo({
  titles: [
    anarchOptions(),
    puzzleOptions('2048'),
    puzzleOptions('hextris'),
    serverSurvivalOptions(),
    isoCityOptions(),
    whatajongOptions(),
  ],
});
console.log(preview.url);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
}
