/** Explicit local preview build. Acquired source and outputs stay ignored. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { verifySource } from '../puzzle-preview/build.mjs';
export const selections = [
  'LICENSE',
  ...[
    'game',
    'in-memoriam',
    'setMethods',
    'rand',
    'setupTiles',
    'maps/responsive',
    'resolveDragons',
    'resolveGems',
    'resolveJokers',
    'resolveMutations',
    'resolvePhoenixes',
    'resolveWinds',
  ].map((p) => `src/renderer/lib/${p}.ts`),
];
export function adaptModule(bytes) {
  const js = stripTypeScriptTypes(bytes.toString(), { mode: 'transform' });
  return js.replace(/from "([^"]+)"/g, (_match, path) => {
    if (path.startsWith('.') && path !== './observability')
      return `from "./engine-${path.slice(2).replaceAll('/', '-')}.js"`;
    if (
      [
        './observability',
        '@/components/audio',
        '@/state/animationState',
        'remeda',
        'solid-js',
        'solid-js/store',
        '@solid-primitives/map',
        '@solid-primitives/set',
        'rand-seed',
      ].includes(path)
    )
      return 'from "./adapter.js"';
    throw new Error(`Unreviewed runtime import: ${path}`);
  });
}
export function buildWhatajong() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const inventory = JSON.parse(
    readFileSync(resolve(root, 'compliance/source-inventories/whatajong.json')),
  );
  const source = resolve(root, 'dist/external/whatajong'),
    out = resolve(root, 'dist/whatajong');
  mkdirSync(dirname(source), { recursive: true });
  if (!existsSync(source))
    execFileSync(
      'git',
      ['clone', '--no-checkout', inventory.upstreamUrl, source],
      { stdio: 'inherit' },
    );
  const selected = selections.map((path) => {
    const bytes = execFileSync('git', [
      '-C',
      source,
      'show',
      `${inventory.revision}:${path}`,
    ]);
    verifySource(
      bytes,
      inventory.files.find((f) => f.path === path),
    );
    return { path, bytes };
  });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of selected) {
    const path =
      f.path === 'LICENSE'
        ? 'UPSTREAM-LICENSE.txt'
        : `engine-${f.path
            .replace('src/renderer/lib/', '')
            .replaceAll('/', '-')
            .replace(/\.ts$/, '.js')}`;
    writeFileSync(
      resolve(out, path),
      f.path === 'LICENSE' ? f.bytes : adaptModule(f.bytes),
    );
  }
  for (const f of readdirSync(resolve(root, 'packages/whatajong/src')))
    copyFileSync(resolve(root, 'packages/whatajong/src', f), resolve(out, f));
  copyFileSync(
    resolve(root, 'packages/puzzle-preview/host.js'),
    resolve(out, 'host.js'),
  );
  copyFileSync(
    resolve(root, 'packages/contracts/src/save-client.js'),
    resolve(out, 'save-client.js'),
  );
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const paths = readdirSync(out, { recursive: true }).filter((path) =>
    /\./.test(path),
  );
  writeFileSync(
    resolve(out, 'build-record.json'),
    JSON.stringify(
      {
        upstream: inventory.upstreamUrl,
        revision: inventory.revision,
        approval: 'pending; local evaluation only',
        adaptation:
          'Opening board, original rules/layout/shuffle. CSS and glyph visual adaptation. Synchronous store and random provider adapters; no campaign, shop, audio, fonts or original artwork.',
        source: selected.map((f) => ({ path: f.path, sha256: sha(f.bytes) })),
        artifacts: paths.sort().map((path) => ({
          path,
          sha256: sha(readFileSync(resolve(out, path))),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`Built local Whatajong in ${out}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildWhatajong();
