import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
import { createLocalNetwork } from '../creator-preview/local-network.mjs';

const dist = new URL('../../dist/dead-end-dash/', import.meta.url);
const akeru = 'https://github.com/Backbone-Labs/akeru';
// The typeface project, and the package its two files were copied from.
const typeface = [
  'https://github.com/eifetx/Pixelify-Sans',
  'https://www.npmjs.com/package/@fontsource/pixelify-sans/v/5.3.0',
];

/** Where each served file comes from. The typeface is the only third-party
 * work; Akeru's save client is platform code; everything else is the game or
 * its adapter, whose rights nobody has reviewed and which stay unknown. */
function asset(path, sourceUrl) {
  if (path.endsWith('.woff2') || path === 'OFL-Pixelify-Sans.txt')
    return { path, kind: 'upstream', license: 'OFL-1.1', evidence: typeface };
  if (path === 'save-client.js')
    return { path, kind: 'original', license: 'MIT', evidence: [akeru] };
  const evidence = {
    'title.js': [sourceUrl, akeru],
    'game.css': [sourceUrl],
  }[path] ?? [akeru];
  return { path, kind: 'generated', license: 'unknown', evidence };
}

/** Catalog options for a set of built files and their build record. Pure, so
 * the declarations are tested without a checkout of the game. */
export function describeDeadEndDash(titleFiles, record, previewImage) {
  return {
    titleFiles,
    // Same-origin requests only: the two typeface files.
    assetRequests: true,
    publicationBlocked:
      'Dead End Dash source and asset rights are recorded as unknown; public distribution has not been reviewed.',
    ...(previewImage ? { previewImage } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'dead-end-dash',
      version: record.version,
      sdk: { range: '^0.1.0' },
      title: 'Dead End Dash',
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.sourceUrl,
          revision: record.revision,
          license: 'unknown',
          rightsStatus: 'unknown',
        },
        assets: Object.keys(titleFiles).map((path) =>
          asset(path, record.sourceUrl),
        ),
      },
      input: { controller: true, touch: true },
      runtime: {
        graphics: { preferred: 'canvas2d', fallback: null },
        requiredFeatures: [],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary:
        'A 60-second co-op maze dash. One maze, one shared map, many funerals.',
      description:
        'Dash through a procedurally generated maze that stays put between sixty-second runs. Everything anyone sees goes on the shared map; checkpoints, attempts, jewels and perks belong to the whole party. Jump pits and spikes, shove Gnashers, levers and friends, plant a flag and follow its trail. Solo play is complete on its own. Online parties of up to eight need the game’s separate party relay, which is not switched on here.',
      category: 'action',
      controls: {
        controller: [
          'Left stick or D-pad moves. A jumps. X, B or RT shoves. Y, LB or RB pings. View opens the game’s own menu; Menu opens Akeru’s.',
          'Menus: stick or D-pad moves the highlight, A selects, B goes back.',
        ],
        touch: [
          'Akeru’s left stick or D-pad moves; A jumps, X or B shoves, Y pings. Tap the game’s menus and map directly.',
          'Keyboard: WASD or arrows move, Space jumps, J, X or Shift shoves, E or K pings, Esc or P opens the game’s menu.',
        ],
      },
      // The account that holds the pinned source. No display name is invented.
      creator: new URL(record.sourceUrl).pathname.split('/')[1],
      ageLabel: 'Unrated · comic pixel gore',
      privacy: [
        'A solo descent as of its last huddle, lifetime records and settings are saved in Akeru on this device. A dash in progress is not saved. No account and no cloud sync.',
        'Solo play contacts nothing but this title’s own files. A party, where a relay has been switched on, shares your chosen name, colour and what your dasher does in the maze with the other players.',
      ],
      notices: [
        {
          label: 'Pixelify Sans typeface, SIL Open Font License 1.1',
          url: typeface[0],
        },
        { label: 'Akeru adapter source and build instructions', url: akeru },
      ],
    },
  };
}

export function deadEndDashOptions() {
  const titleFiles = readBuiltTitle(dist);
  const image = new URL(
    '../../dist/previews/dead-end-dash.png',
    import.meta.url,
  );
  return describeDeadEndDash(
    titleFiles,
    JSON.parse(titleFiles['build-record.json']),
    existsSync(image) ? readFileSync(image) : undefined,
  );
}

/** The build needs an explicitly supplied checkout, so regular builds and CI
 * have none: the title is listed only where it has been built. */
export const deadEndDashTitles = () =>
  existsSync(new URL('build-record.json', dist)) ? [deadEndDashOptions()] : [];

/** Local evaluation only: bridge an explicitly named loopback relay onto the
 * title's own origin and tell the title to use it. Never part of a build. */
export function withLocalRelay(options, port) {
  return {
    ...options,
    upgrade: createLocalNetwork(port),
    titleFiles: {
      ...options.titleFiles,
      'network-config.js': Buffer.from(
        "export const multiplayerUrl = 'same-origin';\n",
      ),
    },
  };
}
