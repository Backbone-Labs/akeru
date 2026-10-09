/** Explicit, pinned, local-only source acquisition. No production registration. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const selections = {
  2048: ['LICENSE.txt', 'js/grid.js', 'js/tile.js', 'js/game_manager.js'],
  hextris: [
    'LICENSE.md',
    'js/Block.js',
    'js/Hex.js',
    'js/Text.js',
    'js/checking.js',
    'js/math.js',
    'js/update.js',
    'js/wavegen.js',
    'js/view.js',
  ],
};
export function verifySource(bytes, entry) {
  if (
    !entry ||
    createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex') !== entry.gitObjectId
  )
    throw new Error('Pinned source mismatch');
}
export function buildPuzzle(id) {
  if (!Object.hasOwn(selections, id)) throw new Error('Unknown puzzle');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const inventory = JSON.parse(
    readFileSync(resolve(root, `compliance/source-inventories/${id}.json`)),
  );
  const source = resolve(root, `dist/external/${id}`),
    out = resolve(root, `dist/${id}`);
  mkdirSync(resolve(root, 'dist/external'), { recursive: true });
  if (!existsSync(source))
    execFileSync(
      'git',
      ['clone', '--no-checkout', inventory.upstreamUrl, source],
      { stdio: 'inherit' },
    );
  execFileSync(
    'git',
    ['-C', source, 'checkout', '--detach', inventory.revision],
    { stdio: 'inherit' },
  );
  const selected = selections[id].map((path) => {
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
  let engine = selected
    .filter((f) => f.path.endsWith('.js'))
    .map((f) => `\n// Upstream ${f.path}\n${f.bytes}`)
    .join('\n');
  // Host replaces upstream menus, storage, analytics and vendor dependencies.
  if (id === 'hextris')
    engine = engine.slice(0, engine.indexOf('function toggleClass('));
  engine = `(()=>{const history={};const localStorage={setItem(){}}; const exportSaveState=()=>'';\n${engine}\nObject.assign(window,{${id === '2048' ? 'Grid,Tile,GameManager' : 'Hex,Block,Text,update,waveGen,blockDestroyed,drawPolygon,renderText,fadeUpAndOut,randInt'}});})();`;
  writeFileSync(resolve(out, 'engine.js'), engine);
  for (const f of readdirSync(resolve(root, `packages/${id}/src`)))
    copyFileSync(resolve(root, `packages/${id}/src`, f), resolve(out, f));
  copyFileSync(
    resolve(root, 'packages/puzzle-preview/host.js'),
    resolve(out, 'host.js'),
  );
  copyFileSync(
    resolve(root, 'packages/contracts/src/save-client.js'),
    resolve(out, 'save-client.js'),
  );
  writeFileSync(resolve(out, 'UPSTREAM-LICENSE.txt'), selected[0].bytes);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  writeFileSync(
    resolve(out, 'build-record.json'),
    JSON.stringify(
      {
        upstream: inventory.upstreamUrl,
        revision: inventory.revision,
        approval: 'pending; local evaluation only',
        source: selected.map((f) => ({ path: f.path, sha256: sha(f.bytes) })),
        artifacts: readdirSync(out)
          .sort()
          .map((path) => ({
            path,
            sha256: sha(readFileSync(resolve(out, path))),
          })),
      },
      null,
      2,
    ),
  );
  console.log(`Built local ${id} in ${out}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  for (const id of process.argv.slice(2).length
    ? process.argv.slice(2)
    : Object.keys(selections))
    buildPuzzle(id);
