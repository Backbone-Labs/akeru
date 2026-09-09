import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { inspectPublicFile } from './check-public-tree.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function packageSource(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  if (git('status', '--porcelain', '--untracked-files=normal').length) {
    throw new Error('Source packaging requires a clean checkout; commit or remove changes first.');
  }
  const revision = git('rev-parse', 'HEAD').toString().trim();
  const files = git('ls-tree', '-rz', 'HEAD').toString().split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/u.exec(entry);
    if (!match || !['100644', '100755'].includes(match[1]) || match[2] !== 'blob') {
      throw new Error('Source archives permit only regular files; no symlinks or submodules.');
    }
    const path = match[4];
    const bytes = git('cat-file', 'blob', match[3]);
    if (path.endsWith('.gitattributes') && /\bexport-(?:ignore|subst)\b/u.test(bytes.toString('utf8'))) {
      throw new Error('Source archives cannot omit or rewrite committed files using export attributes.');
    }
    const errors = inspectPublicFile(path, bytes.toString('utf8'));
    if (errors.length) throw new Error(`${path}: ${errors.join(', ')}`);
    return { path, size: bytes.length, sha256: digest(bytes) };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const rootPackage = JSON.parse(git('show', 'HEAD:package.json'));
  const expectedNode = rootPackage.engines.node;
  if (process.versions.node !== expectedNode) throw new Error(`Use Node ${expectedNode} to package sources.`);
  const archive = gzipSync(git('-c', 'core.attributesFile=/dev/null', 'archive', '--format=tar', '--prefix=akeru/', revision), { level: 9 });
  const filename = `akeru-${revision}.tar.gz`;
  const provenance = {
    schemaVersion: '1.0.0',
    kind: 'source-archive',
    repository: 'https://github.com/Backbone-Labs/akeru',
    revision,
    sourceUrl: `https://github.com/Backbone-Labs/akeru/tree/${revision}`,
    toolchain: { node: expectedNode, packageManager: rootPackage.packageManager },
    artifact: { filename, size: archive.length, sha256: digest(archive) },
    files,
  };
  const output = resolve(cwd, 'dist/source');
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, filename), archive);
  writeFileSync(resolve(output, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = packageSource();
    console.log(`${result.artifact.filename}\nsha256:${result.artifact.sha256}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
