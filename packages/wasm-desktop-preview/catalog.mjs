import { existsSync, readFileSync } from 'node:fs';
import { readBuiltTitle } from '../anarch/artifacts.mjs';
export function optionsFor(id) {
  if (!['supertux', 'supertuxkart'].includes(id)) throw Error('Unknown title');
  const tux = id === 'supertux',
    titleFiles = readBuiltTitle(new URL(`../../dist/${id}/`, import.meta.url)),
    record = JSON.parse(titleFiles['build-record.json']);
  return {
    titleFiles,
    ...(existsSync(new URL(`../../dist/previews/${id}.png`, import.meta.url))
      ? {
          previewImage: readFileSync(
            new URL(`../../dist/previews/${id}.png`, import.meta.url),
          ),
        }
      : {}),
    wasm: true,
    threaded: true,
    publicationBlocked:
      'Pinned source correspondence, dependency and asset license review pending',
    manifest: {
      specVersion: '0.1.0',
      id,
      version: '0.1.0',
      sdk: { range: '^0.1.0' },
      title: tux ? 'SuperTux' : 'SuperTuxKart',
      entry: 'index.html',
      artifacts: [],
      provenance: {
        source: {
          url: record.upstream,
          revision: record.revision,
          license: tux ? 'GPL-3.0-or-later' : 'GPL-3.0-or-later',
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
        graphics: { preferred: 'webgl1', fallback: null },
        requiredFeatures: ['threads'],
        optionalFeatures: [],
      },
      capabilities: ['save.local'],
      saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
    },
    metadata: {
      summary: tux
        ? 'The original penguin platform adventure.'
        : 'The original open-source kart racer.',
      description: tux
        ? 'SuperTux 0.6.3 with original levels, art, music and gameplay. Local browser evaluation.'
        : 'Experimental offline browser port with original karts and tracks. Online modes are not supported. Large download and memory requirements.',
      category: tux ? 'action' : 'racing',
      creator: tux
        ? 'SuperTux team'
        : 'SuperTuxKart team; browser port by ading2210',
      ageLabel: 'Unrated',
      controls: {
        controller: [
          tux
            ? 'D-pad move · A jump · B action · Menu pause'
            : 'D-pad drive · A select · B back · Menu pause',
        ],
        touch: [
          'On-screen buttons and original game menus. Keyboard supported.',
        ],
      },
      privacy: ['Guest local progress only; no account sync.'],
      notices: [{ label: 'Original project and source', url: record.upstream }],
    },
  };
}
