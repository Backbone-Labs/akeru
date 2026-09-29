/** Explicit local-only evaluation. Never feeds the production registry. */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
export function openGolfOptions() {
  const out = new URL('../../dist/open-golf/', import.meta.url);
  const titleFiles = readBuiltTitle(out);
  const record = JSON.parse(titleFiles['build-record.json']);
  const manifest = {
    specVersion: '0.1.0',
    id: 'open-golf',
    version: '0.1.0',
    sdk: { range: '^0.1.0' },
    title: 'Open Golf',
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
      requiredFeatures: ['wasm'],
      optionalFeatures: [],
    },
    capabilities: ['save.local'],
    saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
  };
  const metadata = {
    summary: 'Relaxing miniature golf across twenty original courses.',
    description:
      'Play the original Open Golf courses with realistic ball physics, water hazards and winding greens.',
    category: 'sports',
    creator: 'mgerdes',
    ageLabel: 'Unrated',
    controls: {
      controller: [
        'Left/right aim, up/down power, A putts or starts the next hole. Menu opens courses.',
      ],
      touch: [
        'Drag the ball and release to putt, or use the directional pad and A.',
      ],
    },
    privacy: [
      'Guest local best scores and tutorial progress. No cloud sync, accounts or third-party requests.',
    ],
    notices: [{ label: 'Open Golf source and notices', url: record.upstream }],
  };
  const image = new URL('../../dist/previews/open-golf.png', import.meta.url);
  const previewImage = existsSync(image) ? readFileSync(image) : undefined;
  if (previewImage) metadata.cover = '/previews/open-golf.png';
  return {
    titleFiles,
    manifest,
    metadata,
    wasm: true,
    ...(previewImage ? { previewImage } : {}),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const preview = await startCatalogDemo(openGolfOptions());
  console.log(preview.url + '/g/open-golf');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await preview.close();
      process.exit(0);
    });
}
