import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const server = dirname(fileURLToPath(import.meta.url));
const root = resolve(server, '../../..');
const [releaseArg, outputArg] = process.argv.slice(2);
if (!releaseArg || !outputArg)
  throw new Error(
    'Usage: node prepare-context.mjs <reviewed-release-data> <new-output-directory>',
  );
const release = resolve(releaseArg),
  output = resolve(outputArg);
// Fail before creating an upload context unless the selected release evidence exists.
await Promise.all(
  ['CREDITS.md', 'release-manifest.json', 'notices/cc-by-sa.txt'].map((p) =>
    readFile(resolve(release, p)),
  ),
);
await mkdir(output); // refuse overwriting an existing context
await mkdir(resolve(output, 'packages/red-eclipse'), { recursive: true });
await cp(resolve(root, 'package.json'), resolve(output, 'package.json'));
await cp(
  resolve(root, 'package-lock.json'),
  resolve(output, 'package-lock.json'),
);
await cp(
  resolve(server, '../package.json'),
  resolve(output, 'packages/red-eclipse/package.json'),
);
await cp(server, resolve(output, 'server'), { recursive: true });
await cp(resolve(server, 'Dockerfile'), resolve(output, 'Dockerfile'));
await mkdir(resolve(output, 'maps'));
for (const ext of ['mpz', 'cfg', 'wpt'])
  await cp(
    resolve(release, `data/maps/fortitude.${ext}`),
    resolve(output, `maps/fortitude.${ext}`),
  );
await cp(
  resolve(release, 'data/maps/readme.txt'),
  resolve(output, 'maps/readme.txt'),
);
await cp(resolve(release, 'notices'), resolve(output, 'notices'), {
  recursive: true,
});
await cp(resolve(release, 'CREDITS.md'), resolve(output, 'notices/CREDITS.md'));
await cp(
  resolve(release, 'release-manifest.json'),
  resolve(output, 'notices/release-manifest.json'),
);
await writeFile(
  resolve(output, '.gcloudignore'),
  'node_modules\n.git\n*.log\n',
);
console.log(
  `Prepared isolated server context: ${output}. No deployment was performed.`,
);
