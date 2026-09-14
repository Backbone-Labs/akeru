/** Explicit local-only evaluation. Never feeds the production registry. */
import { readBuiltTitle } from './artifacts.mjs';
import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
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
    'Explore the base edition of Anarch by drummyfish. Source-built local evaluation with controller and touch support. Enable sound inside the game to hear the original effects and soundtrack. Publication and toolchain redistribution approval remain pending.',
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
const preview = await startCatalogDemo({
  titleFiles,
  manifest,
  metadata,
  wasm: true,
});
console.log(preview.url + '/g/anarch');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await preview.close();
    process.exit(0);
  });
