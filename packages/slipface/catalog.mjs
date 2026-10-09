import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function options() {
  const titleFiles = readBuiltTitle(
    new URL('../../dist/slipface/', import.meta.url),
  );
  const record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL('../../dist/previews/slipface.png', import.meta.url);
  return {
    titleFiles,
    // The title makes no requests of its own: no assets, no network.
    assetRequests: false,
    publicationBlocked:
      'Private creator source; public distribution and assets have not been reviewed.',
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'slipface',
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: 'Slipface',
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.sourceUrl,
          revision: record.revision,
          license: 'unknown',
          rightsStatus: 'unknown',
        },
        // Sprites, lettering, sound and music are drawn and synthesized by the
        // game's own code at run time; there are no separate asset files.
        assets: Object.keys(titleFiles).map((path) => ({
          path,
          kind: 'generated',
          license: 'unknown',
          evidence: [record.sourceUrl],
        })),
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
      summary: 'Sandboard down an endless dune. There is a new one every day.',
      description:
        'Carve, hop and tuck your way down a dune that is different every day and the same for everyone who rides it. You carry three boards and every crash costs one. Chase your own ghost down Today’s Dune, or practise in Free Run. Three tunes to ride to.',
      category: 'action',
      creator: 'Backbone',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'Left stick or D-pad steers. A hops. RT, RB or D-pad down tucks for speed. B, X, LT, LB or D-pad up brakes.',
          'View opens the game’s pause menu; Menu opens Akeru’s. In menus the stick or D-pad moves, A selects and B goes back.',
        ],
        touch: [
          'The game draws its own controls: slide your left thumb to steer, with HOP, TUCK and BRAKE under your right. Tap TUCK to switch it on and off. Tap menus directly.',
          'Keyboard: arrows or A/D steer, Space hops, Down or S tucks, Up or W brakes, Esc or P pauses, M steps through the sound options.',
        ],
      },
      privacy: [
        'Best distances, each day’s ghost run and sound settings are saved locally. A run in progress is not saved; it starts again.',
        'Progress stays in Akeru on this device. No cloud sync, no network requests and no analytics. Single-player only.',
      ],
      notices: [
        {
          label: 'Akeru adapter source and build instructions',
          url: 'https://github.com/Backbone-Labs/akeru',
        },
      ],
    },
  };
}
