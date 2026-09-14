import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function readBuiltTitle(directory) {
  const paths = readdirSync(directory);
  for (const path of paths)
    if (!lstatSync(new URL(path, directory)).isFile())
      throw new Error('Only regular built files allowed');
  const record = JSON.parse(
    readFileSync(new URL('build-record.json', directory)),
  );
  const expected = record.artifacts?.map((a) => a.path);
  if (
    !Array.isArray(expected) ||
    new Set(expected).size !== expected.length ||
    expected.some(
      (p) => typeof p !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(p),
    ) ||
    paths.length !== expected.length + 1 ||
    paths.some((p) => p !== 'build-record.json' && !expected.includes(p))
  )
    throw new Error('Unexpected build artifacts');
  const files = Object.fromEntries(
    paths.map((path) => [path, readFileSync(new URL(path, directory))]),
  );
  for (const { path, sha256 } of record.artifacts)
    if (createHash('sha256').update(files[path]).digest('hex') !== sha256)
      throw new Error('Built artifact changed: ' + path);
  return files;
}
