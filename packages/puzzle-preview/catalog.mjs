import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function puzzleOptions(id) {
  if (!['2048', 'hextris'].includes(id)) throw new Error('Unknown puzzle');
  const out = new URL(`../../dist/${id}/`, import.meta.url),
    titleFiles = readBuiltTitle(out),
    record = JSON.parse(titleFiles['build-record.json']);
  const title = id === '2048' ? '2048' : 'Hextris',
    license = id === '2048' ? 'MIT' : 'GPL-3.0-or-later';
  const image = new URL(`../../dist/previews/${id}.png`, import.meta.url);
  return {
    titleFiles,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id,
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title,
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.upstream,
          revision: record.revision,
          license,
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
        graphics: {
          preferred: id === '2048' ? 'dom' : 'canvas2d',
          fallback: null,
        },
        requiredFeatures: [],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary:
        id === '2048'
          ? 'Slide, combine, and find your way to 2048.'
          : 'Rotate the hexagon. Match colors. Keep the board clear.',
      description:
        id === '2048'
          ? 'The original 2048 logic, adapted for keyboard, mouse, touch, and controller. Merge equal tiles to reach 2048.'
          : 'The original Hextris puzzle engine with a new isolated host adapter. Match three or more adjacent colors before stacks reach the border.',
      category: 'puzzle',
      creator: id === '2048' ? 'Gabriele Cirulli' : 'Hextris contributors',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          id === '2048'
            ? 'D-pad / left stick — slide tiles.'
            : 'D-pad / left stick — rotate hexagon.',
        ],
        touch: [
          id === '2048'
            ? 'Swipe the board, or use arrow buttons. Keyboard: arrows / WASD.'
            : 'Tap either side, or use rotate buttons. Keyboard: left / right, A / D.',
        ],
      },
      privacy: [
        id === '2048'
          ? 'Progress saved locally through Akeru. No external requests.'
          : 'Best score saved locally through Akeru. No external requests.',
      ],
      notices: [
        {
          label: `${title} source and ${license} notice`,
          url: record.upstream,
        },
      ],
    },
  };
}
