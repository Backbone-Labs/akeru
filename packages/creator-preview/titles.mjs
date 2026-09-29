import { existsSync } from 'node:fs';
import { options as manor } from '../westwick-manor/catalog.mjs';
import { options as kitchen } from '../mythic-kitchen/catalog.mjs';
/** Private source builds are opt-in and never downloaded by regular CI/builds. */
export function creatorTitles() {
  return [
    ['westwick-manor', manor],
    ['mythic-kitchen', kitchen],
  ]
    .filter(([id]) =>
      existsSync(
        new URL(`../../dist/${id}/build-record.json`, import.meta.url),
      ),
    )
    .map(([, options]) => options());
}
