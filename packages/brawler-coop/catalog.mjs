import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function brawlerOptions() {
  const titleFiles = readBuiltTitle(
    new URL('../../dist/brawler-coop/', import.meta.url),
  );
  titleFiles['save-client.js'] = readFileSync(
    new URL('../contracts/src/save-client.js', import.meta.url),
  );
  const record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL(
    '../../dist/previews/brawler-coop.png',
    import.meta.url,
  );
  return {
    titleFiles,
    blobImages: true,
    wasm: true,
    ...(record.relayUrl
      ? { networkOrigin: new URL(record.relayUrl).origin }
      : {}),
    assetRequests: true,
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id: 'brawler-coop',
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: 'Brawler Co-op',
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.sourceUrl,
          revision: record.revision,
          license: 'MIT',
          rightsStatus: 'unknown',
        },
        assets: Object.keys(titleFiles).map((path) => ({
          path,
          kind: 'generated',
          license: 'unknown',
          evidence: ['https://quiver.dev', 'https://godotengine.org/license/'],
        })),
      },
      input: { controller: true, touch: true },
      runtime: {
        graphics: { preferred: 'webgl2', fallback: null },
        requiredFeatures: ['wasm'],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary: 'Take back the streets in a pixel-art beat ’em up.',
      description: record.relayUrl
        ? 'Take back the streets solo or with up to three friends. Choose Online Co-op, create a room, and share its six-character code. The host starts the match once friends join.'
        : 'Brawl through a city full of enemies in solo mode.',
      category: 'action',
      creator: 'Quiver; Brawler Co-op adaptation',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          'Left stick / D-pad — move. A — jump / confirm. X or RT — attack.',
        ],
        touch: [
          'Left stick — move. A — jump / confirm. X — attack. Keyboard: arrows, C to jump, X to attack.',
        ],
      },
      privacy: [
        record.relayUrl
          ? 'Guest online co-op uses a room-scoped game relay. No account or cloud saves. The host must stay connected; rooms expire after 45 minutes.'
          : 'Solo play. No account or cloud sync.',
        'Runs are not saved. Restart begins a new run.',
      ],
      notices: [
        {
          label: 'Original game: Quiver (MIT code, CC-BY 4.0 assets)',
          url: 'https://quiver.dev',
        },
        {
          label: 'Godot Engine license',
          url: 'https://godotengine.org/license/',
        },
      ],
    },
  };
}
