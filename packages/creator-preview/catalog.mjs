import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function creatorOptions(id, metadata) {
  const dir = new URL(`../../dist/${id}/`, import.meta.url);
  const titleFiles = readBuiltTitle(dir),
    record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL(`../../dist/previews/${id}.png`, import.meta.url);
  return {
    titleFiles,
    assetRequests: true,
    publicationBlocked:
      'Private creator source; public distribution and assets have not been reviewed.',
    ...(existsSync(image) ? { previewImage: readFileSync(image) } : {}),
    manifest: {
      specVersion: '0.1.0',
      id,
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: metadata.title,
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.sourceUrl,
          revision: record.revision,
          license: 'unknown',
          rightsStatus: 'unknown',
        },
        assets: Object.keys(titleFiles).map((path) => ({
          path,
          kind: 'generated',
          license: 'unknown',
          evidence: [record.sourceUrl],
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
      summary: metadata.summary,
      description: metadata.description,
      category: metadata.category,
      controls: metadata.controls,
      creator: 'Kishan Patel',
      ageLabel: 'Unrated',
      privacy: [
        metadata.saveDescription,
        'Progress stays in Akeru on this device. No cloud sync. Online play requires the separate game server.',
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
