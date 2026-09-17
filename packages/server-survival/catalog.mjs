import { readFileSync, existsSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function serverSurvivalOptions() {
  const titleFiles = readBuiltTitle(
      new URL('../../dist/server-survival/', import.meta.url),
    ),
    record = JSON.parse(titleFiles['build-record.json']),
    image = new URL('../../dist/previews/server-survival.png', import.meta.url);
  return {
    titleFiles,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'server-survival',
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: 'Server Survival',
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
        graphics: { preferred: 'webgl2', fallback: null },
        requiredFeatures: [],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary: 'Build a cloud. Survive the traffic.',
      description:
        'The original open-source Server Survival: build and connect services, balance demand and survive failures. Includes upstream campaign and sandbox modes. This local adaptation removes unverified audio and external CDN requests.',
      category: 'strategy',
      creator: 'pshenok and contributors',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'D-pad / left stick — move cursor. A — click; hold A and move to drag connections. B — back.',
        ],
        touch: [
          'Tap tools and place services. Drag between services to connect. Keyboard and mouse use upstream controls.',
        ],
      },
      privacy: [
        'Guest saves stay on this device through Akeru. Use Save in the game to save your architecture; campaign progress saves automatically. No external requests or account access.',
      ],
      notices: [
        {
          label: 'Server Survival source and MIT license',
          url: record.upstream,
        },
        {
          label: 'Three.js MIT source',
          url: 'https://github.com/mrdoob/three.js/tree/r128',
        },
      ],
    },
  };
}
