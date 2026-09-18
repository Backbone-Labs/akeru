/** Explicit download, never called by root build/check or deployment. */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const id = process.argv[2];
if (!['supertux', 'supertuxkart'].includes(id))
  throw Error('Specify supertux or supertuxkart');
const root = new URL('../../', import.meta.url),
  dir = new URL('dist/tux-research/', root);
const inventory = JSON.parse(
  readFileSync(
    new URL(`compliance/source-inventories/${id}-browser.json`, root),
  ),
);
for (const f of inventory.downloads) {
  const path = new URL(f.path, dir);
  mkdirSync(new URL('.', path), { recursive: true });
  if (!existsSync(path))
    execFileSync(
      'curl',
      [
        '--fail',
        '--location',
        '--silent',
        '--show-error',
        f.url,
        '--output',
        fileURLToPath(path),
      ],
      { stdio: 'inherit' },
    );
  if (
    createHash('sha256').update(readFileSync(path)).digest('hex') !== f.sha256
  )
    throw Error('Downloaded artifact digest mismatch: ' + f.path);
}
execFileSync(
  'python3',
  [
    fileURLToPath(new URL('unpack.py', import.meta.url)),
    id,
    fileURLToPath(dir),
  ],
  { stdio: 'inherit' },
);
