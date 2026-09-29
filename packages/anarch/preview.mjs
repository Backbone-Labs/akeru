/** Explicit local-only evaluation. Never feeds the production registry. */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readBuiltTitle } from './artifacts.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
export function anarchOptions() {
  const out = new URL('../../dist/anarch/', import.meta.url);
  const titleFiles = readBuiltTitle(out);
  const record = JSON.parse(titleFiles['build-record.json']);
  const manifest = {
    specVersion: '0.1.0',
    id: 'anarch',
    version: '0.1.0',
    sdk: { range: '^0.1.0' },
    title: 'Anarch',
    entry: 'index.html',
    artifacts: [],
    provenance: {
      source: {
        url: record.upstream,
        revision: record.revision,
        license: 'CC0-1.0',
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
  };
  const metadata = {
    summary: 'A tiny, fast-paced retro first-person shooter.',
    description:
      'Explore strange corridors, find your way through and keep moving. A fast retro shooter by drummyfish.',
    category: 'action',
    creator: 'drummyfish',
    ageLabel: 'Unrated · pixelated combat',
    controls: {
      controller: [
        'Left stick / D-pad — move and turn. A — fire or confirm. B + directions — strafe or look. Menu + down — game menu.',
      ],
      touch: [
        'Directional arrows — move and turn. A — fire or confirm. Hold B with arrows — strafe or look. Menu + down — game menu.',
      ],
    },
    privacy: [
      'Guest local progress at level boundaries. No cloud sync, accounts or third-party requests.',
    ],
    notices: [{ label: 'Anarch source and CC0 notice', url: record.upstream }],
  };
  const image = new URL('../../dist/previews/anarch.png', import.meta.url);
  const previewImage = existsSync(image) ? readFileSync(image) : undefined;
  if (previewImage) metadata.cover = '/previews/anarch.png';
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
  const preview = await startCatalogDemo(anarchOptions());
  console.log(preview.url + '/g/anarch');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await preview.close();
      process.exit(0);
    });
}
