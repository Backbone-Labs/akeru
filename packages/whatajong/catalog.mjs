import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function whatajongOptions() {
  const titleFiles = readBuiltTitle(
      new URL('../../dist/whatajong/', import.meta.url),
    ),
    record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL('../../dist/previews/whatajong.png', import.meta.url);
  return {
    titleFiles,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'whatajong',
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: 'Whatajong',
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
        graphics: { preferred: 'dom', fallback: null },
        requiredFeatures: [],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary: 'Find a little focus. Free the tiles. Clear the board.',
      description:
        'Play Whatajong’s original opening board: 54 tiles, a layered layout and the original matching, scoring and solvable-deal logic. This local port uses new CSS tile faces and system lettering; the campaign, shop, original artwork and audio are not included.',
      category: 'puzzle',
      creator: 'Pao Ramon',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'D-pad / left stick — navigate free tiles. A — select. B — hint. A after a finished board — new board.',
        ],
        touch: [
          'Tap two free matching tiles. Use Hint to reveal a pair. Keyboard: arrows / WASD, Enter / Space, R for a new board.',
        ],
      },
      privacy: [
        'Opening-board progress saves locally through Akeru. No external requests.',
      ],
      notices: [
        { label: 'Whatajong source and MIT license', url: record.upstream },
      ],
    },
  };
}
