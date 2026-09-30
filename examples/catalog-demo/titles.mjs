import { existsSync } from 'node:fs';
import { brawlerOptions } from '../../packages/brawler-coop/catalog.mjs';
import { creatorTitles } from '../../packages/creator-preview/titles.mjs';
import { options as kartOptions } from '../../packages/old-san-juan-kart/catalog.mjs';
import { options as hexglOptions } from '../../packages/hexgl/catalog.mjs';
import { options as racerOptions } from '../../packages/racer/catalog.mjs';
import { options as astrayOptions } from '../../packages/astray/catalog.mjs';
import { options as breaklockOptions } from '../../packages/breaklock/catalog.mjs';
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
    ...creatorTitles(),
    ...(existsSync(
      new URL('../../dist/brawler-coop/build-record.json', import.meta.url),
    )
      ? [brawlerOptions()]
      : []),
    anarchOptions(),
    hexglOptions(),
    racerOptions(),
    kartOptions(),
    astrayOptions(),
    breaklockOptions(),
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
