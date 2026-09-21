/** Explicit local builds of pinned upstream sources; never publication approval. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from '../puzzle-preview/build.mjs';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function beginBuild(id) {
  if (
    !['hexgl', 'racer', 'astray', 'breaklock', 'old-san-juan-kart'].includes(id)
  )
    throw new Error('Unknown title');
  const inventory = JSON.parse(
    readFileSync(resolve(root, `compliance/source-inventories/${id}.json`)),
  );
  const source = resolve(root, `dist/external/${id}`);
  if (!existsSync(source))
    execFileSync(
      'git',
      ['clone', '--no-checkout', inventory.upstreamUrl, source],
      { stdio: 'inherit' },
    );
  const selected = [];
  const read = (path) => {
    const entry = inventory.files.find((f) => f.path === path);
    if (!entry) throw new Error('Uninventoried source: ' + path);
    const bytes = execFileSync(
      'git',
      ['-C', source, 'show', `${inventory.revision}:${path}`],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    verifySource(bytes, entry);
    selected.push({ path, sha256: hash(bytes) });
    return bytes;
  };
  const out = resolve(root, `dist/${id}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const put = (path, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(path)) throw new Error('Unsafe output');
    writeFileSync(resolve(out, path), bytes);
  };
  return {
    inventory,
    read,
    put,
    finish() {
      for (const path of readdirSync(resolve(root, `packages/${id}/src`)))
        put(path, readFileSync(resolve(root, `packages/${id}/src`, path)));
      put(
        'host.js',
        readFileSync(resolve(root, 'packages/arcade-preview/host.js')),
      );
      put(
        'common.css',
        readFileSync(resolve(root, 'packages/arcade-preview/common.css')),
      );
      put(
        'save-client.js',
        readFileSync(resolve(root, 'packages/contracts/src/save-client.js')),
      );
      put(
        'build-record.json',
        JSON.stringify(
          {
            upstream: inventory.upstreamUrl,
            revision: inventory.revision,
            approval: 'pending; local evaluation only',
            source: selected,
            artifacts: readdirSync(out)
              .sort()
              .map((path) => ({
                path,
                sha256: hash(readFileSync(resolve(out, path))),
              })),
          },
          null,
          2,
        ),
      );
      console.log(`Built ${id} local preview`);
    },
  };
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function replaceRequired(text, from, to) {
  if (!text.includes(from))
    throw new Error('Upstream patch anchor missing: ' + from.slice(0, 80));
  return text.replace(from, to);
}
