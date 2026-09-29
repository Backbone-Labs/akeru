import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function isoCityOptions() {
  const titleFiles = readBuiltTitle(
      new URL('../../dist/isocity/', import.meta.url),
    ),
    record = JSON.parse(titleFiles['build-record.json']),
    image = new URL('../../dist/previews/isocity.png', import.meta.url);
  return {
    titleFiles,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'isocity',
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: 'IsoCity',
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.upstream,
          revision: record.revision,
          license: 'MIT',
          rightsStatus: 'unknown',
        },
        assets: Object.keys(titleFiles).map((path) => ({
          path,
          kind: 'generated',
          license: 'unknown',
          evidence: [record.upstream],
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
      summary: 'A little city, all your own.',
      description:
        'Victor Ribeiro’s original isometric city-builder placement and rendering logic, adapted with a new procedural tile set and guest saves. Place houses, towers, parks and streets on a small canvas. Original texture artwork and URL-save helpers are excluded.',
      category: 'sandbox',
      creator: 'Victor Ribeiro · procedural art by Akeru',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'D-pad / left stick — choose tile. A — build. B — next building.',
        ],
        touch: [
          'Tap a building in the palette, then a city tile. Keyboard: arrows / WASD, Enter / Space to build, B for next building.',
        ],
      },
      privacy: [
        'City saved locally through Akeru. No external requests or account access.',
      ],
      notices: [
        { label: 'IsoCity source and MIT license', url: record.upstream },
      ],
    },
  };
}
