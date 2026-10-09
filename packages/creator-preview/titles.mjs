import { existsSync } from 'node:fs';
import { options as standstill } from '../standstill/catalog.mjs';
import { options as manor } from '../westwick-manor/catalog.mjs';
import { options as kitchen } from '../mythic-kitchen/catalog.mjs';
import { options as slipface } from '../slipface/catalog.mjs';
/** Private source builds are opt-in and never downloaded by regular CI/builds. */
export function creatorTitles() {
  return [
    ['westwick-manor', manor],
    ['mythic-kitchen', kitchen],
    ['standstill', standstill],
    ['slipface', slipface],
  ]
    .filter(([id]) =>
      existsSync(
        new URL(`../../dist/${id}/build-record.json`, import.meta.url),
      ),
    )
    .map(([, options]) => options());
}
