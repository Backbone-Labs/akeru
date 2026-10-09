import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { verifySource } from '../puzzle-preview/build.mjs';
export function selectIsoCityCore(source) {
  const at = source.indexOf('const click = e => {');
  if (at < 0) throw Error('Upstream placement core missing');
  const core = source.slice(at);
  if (/ToBase64|FromBase64|history\./.test(core))
    throw Error('Excluded helper in core');
  return core;
}
export function buildIsoCity() {
  const root = fileURLToPath(new URL('../../', import.meta.url)),
    inventory = JSON.parse(
      readFileSync(resolve(root, 'compliance/source-inventories/isocity.json')),
    ),
    source = resolve(root, 'dist/external/isocity'),
    out = resolve(root, 'dist/isocity');
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
  const selected = ['LICENSE', 'js/main.js'].map((path) => {
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
  for (const name of readdirSync(resolve(root, 'packages/isocity/src')))
    copyFileSync(
      resolve(root, 'packages/isocity/src', name),
      resolve(out, name),
    );
  writeFileSync(
    resolve(out, 'engine.js'),
    '(()=>{' +
      readFileSync(resolve(root, 'packages/isocity/engine-prefix.js'), 'utf8') +
      '\n' +
      selectIsoCityCore(String(selected[1].bytes)) +
      '\n' +
      readFileSync(resolve(root, 'packages/isocity/engine-suffix.js'), 'utf8') +
      '\n})();',
  );
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
        adaptation:
          'Original placement and rendering core. New procedural tile atlas; excluded upstream textures and borrowed base64 helpers.',
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
  console.log(`Built local IsoCity in ${out}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildIsoCity();
