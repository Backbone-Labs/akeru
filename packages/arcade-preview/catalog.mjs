import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function titleOptions(
  id,
  metadata,
  { graphics = 'canvas2d', assetRequests = false, license = 'unknown' } = {},
) {
  if (
    !['hexgl', 'racer', 'astray', 'breaklock', 'old-san-juan-kart'].includes(id)
  )
    throw new Error('Unknown title');
  const titleFiles = readBuiltTitle(
    new URL(`../../dist/${id}/`, import.meta.url),
  );
  const record = JSON.parse(titleFiles['build-record.json']);
  const image = new URL(`../../dist/previews/${id}.png`, import.meta.url);
  return {
    titleFiles,
    assetRequests,
    ...(['hexgl', 'astray'].includes(id)
      ? {
          publicationBlocked:
            id === 'hexgl'
              ? 'Conflicting upstream MIT / noncommercial file headers'
              : 'Legacy dependency and image license review pending',
        }
      : {}),
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
        graphics: { preferred: graphics, fallback: null },
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
      creator: metadata.creator,
      ageLabel: 'Unrated',
      controls: metadata.controls,
      privacy: [metadata.saves + ' No external services or analytics.'],
      notices: [
        { label: 'Upstream source and license notices', url: record.upstream },
      ],
    },
  };
}
