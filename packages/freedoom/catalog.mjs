import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
import { editions, sources } from './sources.mjs';
export function freedoomOptions(id = 'freedoom1') {
  if (!Object.hasOwn(editions, id)) throw new Error('Unknown Freedoom edition');
  const titleFiles = readBuiltTitle(
    new URL('../../dist/' + id + '/', import.meta.url),
  );
  const record = JSON.parse(titleFiles['build-record.json']);
  if (
    record.id !== id ||
    record.revision !== sources.engine.revision ||
    record.sources?.data?.revision !== sources.data.revision
  )
    throw new Error('Freedoom build identity mismatch');
  const image = new URL('../../dist/previews/' + id + '.png', import.meta.url);
  return {
    titleFiles,
    wasm: true,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id,
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: editions[id].title,
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: sources.engine.url,
          revision: sources.engine.revision,
          license: 'GPL-2.0',
          rightsStatus: 'unknown',
        },
        assets: Object.keys(titleFiles).map((path) => ({
          path,
          kind: 'generated',
          license: 'unknown',
          evidence: [sources.engine.url, sources.data.url],
        })),
      },
      input: { controller: true, touch: true },
      runtime: {
        graphics: { preferred: 'canvas2d', fallback: null },
        requiredFeatures: ['wasm'],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary:
        id === 'freedm'
          ? 'Explore 32 arenas in solo practice.'
          : 'A complete retro first-person shooter campaign.',
      description:
        id === 'freedm'
          ? 'The original FreeDM arenas in PrBoom. Local solo map practice, with a Next map button. This build has no bots, opponents or remote multiplayer.'
          : 'The original Freedoom campaign and artwork, built from source and running in PrBoom. Explore, battle monsters and find each level’s exit.',
      category: 'action',
      creator: 'Freedoom contributors · PrBoom contributors',
      ageLabel: 'Unrated · pixelated combat',
      controls: {
        controller: [
          'Left stick — move forward/back and strafe sideways.',
          'Right stick left/right — turn. D-pad up/down — move; left/right — turn.',
          'A / right trigger — fire. B / X — use (open doors and activate switches).',
          'Y — next weapon. Left / right shoulder — strafe.',
          'Open the Backbone overlay to pause or return to this controls guide.',
        ],
        touch: [
          'Arrows — move and turn. A — fire. B — use. Keyboard: WASD, mouse look, click fire, E / Space use, Q / R weapon, M menu.',
        ],
      },
      privacy: [
        'Guest saves through Akeru; no accounts, cloud sync or network play. Save automatically every 15 seconds, on pause, or with Save.',
      ],
      notices: [
        { label: 'PrBoom source and GPL license', url: sources.engine.url },
        {
          label: 'Freedoom source, BSD license and credits',
          url: sources.data.url,
        },
      ],
      ...(existsSync(image) ? { cover: '/previews/' + id + '.png' } : {}),
    },
  };
}
