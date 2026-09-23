import { anarchOptions } from '../../packages/anarch/preview.mjs';
import { puzzleOptions } from '../../packages/puzzle-preview/catalog.mjs';

import { serverSurvivalOptions } from '../../packages/server-survival/catalog.mjs';
import { isoCityOptions } from '../../packages/isocity/catalog.mjs';
import { whatajongOptions } from '../../packages/whatajong/catalog.mjs';

import { openGolfOptions } from '../../packages/open-golf/preview.mjs';
import { freedoomOptions } from '../../packages/freedoom/catalog.mjs';

import { tathamOptions } from '../../packages/tatham/catalog.mjs';
import { titles as puzzleTitles } from '../../packages/tatham/titles.mjs';

export function playableTitles() {
  return [
    anarchOptions(),
    puzzleOptions('2048'),
    puzzleOptions('hextris'),
    serverSurvivalOptions(),
    isoCityOptions(),
    whatajongOptions(),
    openGolfOptions(),
    ...['freedoom1', 'freedoom2', 'freedm'].map(freedoomOptions),
    ...puzzleTitles.map((title) => tathamOptions(title.id)),
  ];
}
