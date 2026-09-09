import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageSource } from './package-source.mjs';
import { sha256 } from './package-staging.mjs';

export function packageCatalog(cwd = process.cwd()) {
  const source = packageSource(cwd);
  const committed = (path) =>
    execFileSync('git', ['show', `${source.revision}:${path}`], { cwd });
  const assets = new Map();
  const add = (path, bytes, type) => assets.set(path, { bytes, type });
  for (const path of [
    'index.html',
    'favicon.svg',
    'style.css',
    'app.js',
    'model.js',
    'channel.js',
    'catalog.json',
  ]) {
    add(
      path,
      committed(`platform/catalog/${path}`),
      path.endsWith('.svg')
        ? 'image/svg+xml'
        : path.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : path.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : path.endsWith('.js')
              ? 'text/javascript; charset=utf-8'
              : 'application/json; charset=utf-8',
    );
  }
  // Publication is a separate reviewed integration. No candidate manifests,
  // demo entries, invented approvals or query-selected registries enter deploys.
  const registry = JSON.parse(assets.get('catalog.json').bytes);
  if (
    registry.schemaVersion !== '0.1.0' ||
    registry.mode !== 'production' ||
    !Array.isArray(registry.entries) ||
    registry.entries.length !== 0
  )
    throw new Error(
      'This deployment path requires the empty production registry',
    );
  for (const path of [
    'browser.js',
    'index.js',
    'normalize.js',
    'preferences.js',
    'overlay.js',
    'styles.css',
  ]) {
    add(
      `input/${path}`,
      committed(`packages/input/src/${path}`),
      path.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8',
    );
  }
  add(
    'bootstrap.js',
    Buffer.from(
      "import { createBrowserInputProvider } from '/input/browser.js';\nimport { mountCatalog } from '/app.js';\nmountCatalog({ inputProviderFactory: createBrowserInputProvider });\n",
    ),
    'text/javascript; charset=utf-8',
  );
  add('LICENSE.txt', committed('LICENSE'), 'text/plain; charset=utf-8');
  add(
    'source.tar.gz',
    readFileSync(resolve(cwd, 'dist/source', source.artifact.filename)),
    'application/gzip',
  );
  add(
    'provenance.json',
    Buffer.from(`${JSON.stringify(source, null, 2)}\n`),
    'application/json; charset=utf-8',
  );
  const release = {
    schemaVersion: '1.0.0',
    kind: 'catalog-shell',
    revision: source.revision,
    titleOrigins: [],
    files: [...assets].map(([path, { bytes, type }]) => ({
      path,
      type,
      size: bytes.length,
      sha256: sha256(bytes),
    })),
  };
  const directory = resolve(cwd, 'dist/catalog');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const [path, { bytes }] of assets) {
    mkdirSync(resolve(directory, path, '..'), { recursive: true });
    writeFileSync(resolve(directory, path), bytes);
  }
  const metadata = Buffer.from(`${JSON.stringify(release, null, 2)}\n`);
  writeFileSync(resolve(directory, 'release.json'), metadata);
  const output = resolve(cwd, 'dist/catalog-cloudflare');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const worker = committed('platform/hosting/catalog-worker.mjs').toString();
  const manifest = {
    ...release,
    digest: sha256(metadata),
    files: [
      ...release.files,
      {
        path: 'release.json',
        type: 'application/json; charset=utf-8',
        size: metadata.length,
        sha256: sha256(metadata),
      },
    ],
  };
  writeFileSync(
    resolve(output, 'worker.mjs'),
    `${worker}\nexport default createCatalogWorker(${JSON.stringify(manifest)});\n`,
  );
  writeFileSync(
    resolve(output, 'wrangler.json'),
    `${JSON.stringify({ name: 'akeru-catalog-staging', main: 'worker.mjs', compatibility_date: '2026-09-09', workers_dev: true, preview_urls: false, assets: { directory: '../catalog', binding: 'ASSETS', run_worker_first: true, html_handling: 'none', not_found_handling: 'none' } }, null, 2)}\n`,
  );
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(JSON.stringify(packageCatalog(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
