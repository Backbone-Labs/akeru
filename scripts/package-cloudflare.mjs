import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageStaging, sha256 } from './package-staging.mjs';
import { loadStaging, shellHeaders } from './serve-staging.mjs';

export function packageCloudflare(cwd = process.cwd()) {
  packageStaging(cwd);
  const verified = loadStaging(resolve(cwd, 'dist/staging'));
  const release = {
    revision: verified.release.revision,
    digest: verified.digest,
    files: [...verified.files].map(([path, file]) => ({
      path: path.slice(1),
      type: file.type,
      size: file.bytes.length,
      sha256: sha256(file.bytes),
    })),
  };
  const output = resolve(cwd, 'dist/cloudflare');
  mkdirSync(output, { recursive: true });
  const worker = execFileSync(
    'git',
    ['show', `${release.revision}:platform/hosting/worker.mjs`],
    { cwd, encoding: 'utf8' },
  );
  writeFileSync(
    resolve(output, 'worker.mjs'),
    `${worker}\nexport default createStagingWorker(${JSON.stringify(release)}, ${JSON.stringify(shellHeaders)});\n`,
  );
  const config = {
    name: 'akeru-staging',
    main: 'worker.mjs',
    compatibility_date: '2026-09-09',
    workers_dev: true,
    preview_urls: false,
    assets: {
      directory: '../staging',
      binding: 'ASSETS',
      run_worker_first: true,
      html_handling: 'none',
      not_found_handling: 'none',
    },
  };
  writeFileSync(
    resolve(output, 'wrangler.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  return release;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(JSON.stringify(packageCloudflare(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
