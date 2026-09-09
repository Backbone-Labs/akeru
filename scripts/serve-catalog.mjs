import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './package-staging.mjs';
import { createCatalogWorker } from '../platform/hosting/catalog-worker.mjs';
import { createContainedFileReader } from './read-contained-file.mjs';
export function loadCatalog(directory) {
  const reader = createContainedFileReader(directory);
  const { root } = reader;
  const read = (name) => {
    try {
      return reader.read(name);
    } catch (error) {
      if (error.message === 'Unsafe file path') throw error;
      throw new Error('Expected regular release file', { cause: error });
    }
  };
  const metadata = read('release.json');
  const release = JSON.parse(metadata);
  if (release.schemaVersion !== '1.0.0' || release.kind !== 'catalog-shell')
    throw new Error('Invalid catalog release');
  const manifest = { ...release, digest: sha256(metadata) };
  createCatalogWorker(manifest); // validates paths before reading
  const names = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      relative(root, resolve(entry.parentPath, entry.name))
        .split(sep)
        .join('/'),
    )
    .sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify(
      [...release.files.map((file) => file.path), 'release.json'].sort(),
    )
  )
    throw new Error('Unexpected release files');
  const bytes = new Map();
  for (const file of release.files) {
    const data = read(file.path);
    if (data.length !== file.size || sha256(data) !== file.sha256)
      throw new Error('Release digest mismatch');
    bytes.set(`/${file.path}`, data);
  }
  const provenance = JSON.parse(bytes.get('/provenance.json'));
  if (
    provenance.revision !== release.revision ||
    provenance.artifact.sha256 !== sha256(bytes.get('/source.tar.gz'))
  )
    throw new Error('Source provenance mismatch');
  manifest.files.push({
    path: 'release.json',
    type: 'application/json; charset=utf-8',
    size: metadata.length,
    sha256: sha256(metadata),
  });
  bytes.set('/release.json', metadata);
  return {
    manifest,
    worker: createCatalogWorker(manifest),
    env: {
      ASSETS: {
        fetch: async (request) =>
          new Response(bytes.get(new URL(request.url).pathname)),
      },
    },
  };
}
export function createCatalogServer(directory) {
  const { worker, env } = loadCatalog(directory);
  return createServer(async (request, response) => {
    try {
      const result = await worker.fetch(
        new Request(`http://127.0.0.1${request.url}`, {
          method: request.method,
        }),
        env,
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500);
      response.end('Catalog unavailable');
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  createCatalogServer(process.argv[2] ?? 'dist/catalog').listen(
    port,
    '127.0.0.1',
    () => console.log(`Catalog preview: http://127.0.0.1:${port}`),
  );
}
