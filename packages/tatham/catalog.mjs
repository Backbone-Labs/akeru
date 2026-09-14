import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
import { titles } from './titles.mjs';
export function tathamOptions(id) {
  const game = titles.find((title) => title.id === id);
  if (!game) throw new Error('Unknown Tatham title');
  const out = new URL(`../../dist/${id}/`, import.meta.url),
    titleFiles = readBuiltTitle(out),
    record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL(`../../dist/previews/${id}.png`, import.meta.url);
  return {
    wasm: true,
    titleFiles,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id,
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: game.title,
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
        requiredFeatures: ['wasm'],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary: game.description,
      description: `${game.description} The original ${game.title} engine from Simon Tatham’s Portable Puzzle Collection, compiled to WebAssembly.`,
      category: 'puzzle',
      creator: 'Simon Tatham and contributors',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'D-pad / left stick: move. A: select. B: alternate action.',
          'Right stick up/down: undo/redo.',
          ...(game.numeric
            ? [
                'Right stick left/right: choose digit. A: enter digit. B: clear.',
              ]
            : []),
        ],
        touch: [
          'Tap or drag the puzzle board. Touch: alternate enables right-click actions.',
          'On-screen arrows, Select and Alternate also control the puzzle. Keyboard arrows and Enter / Space are supported.',
        ],
      },
      privacy: [
        'Guest progress stays behind Akeru’s title-scoped save service. No external requests.',
      ],
      notices: [
        { label: 'Original source and MIT licence', url: record.upstream },
      ],
    },
  };
}
