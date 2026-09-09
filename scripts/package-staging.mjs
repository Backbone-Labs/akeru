import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageSource } from './package-source.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function packageStaging(cwd = process.cwd()) {
  const source = packageSource(cwd);
  const committed = (path) => execFileSync('git', ['show', `${source.revision}:${path}`], { cwd });
  const html = committed('platform/staging/index.html').toString().replaceAll('{{REVISION}}', source.revision);
  const files = {
    'index.html': Buffer.from(html),
    'style.css': committed('platform/staging/style.css'),
    'LICENSE.txt': committed('LICENSE'),
    'source.tar.gz': readFileSync(resolve(cwd, 'dist/source', source.artifact.filename)),
    'provenance.json': Buffer.from(`${JSON.stringify(source, null, 2)}\n`),
  };
  const release = {
    schemaVersion: '1.0.0', kind: 'staging-shell', revision: source.revision,
    sourceUrl: source.sourceUrl, toolchain: source.toolchain,
    files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, sha256: sha256(bytes) })),
  };
  const output = resolve(cwd, 'dist/staging');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const [path, bytes] of Object.entries(files)) writeFileSync(resolve(output, path), bytes);
  writeFileSync(resolve(output, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
  return release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(packageStaging(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
