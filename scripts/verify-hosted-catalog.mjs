import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from './serve-catalog.mjs';
import { sha256 } from './package-staging.mjs';
import { catalogHeaders } from '../platform/hosting/catalog-worker.mjs';
export async function verifyHostedCatalog(origin, manifest, fetcher = fetch) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('Use an exact HTTPS origin');
  const get = async (path, expected = 200) => {
    const response = await fetcher(`${origin}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== expected)
      throw new Error(`${path}: HTTP ${response.status}`);
    for (const [key, value] of Object.entries(
      catalogHeaders(manifest.titleOrigins),
    ))
      if (response.headers.get(key) !== value)
        throw new Error(`${path}: changed ${key}`);
    if (
      !/max-age=[1-9][0-9]*/.test(
        response.headers.get('strict-transport-security') ?? '',
      )
    )
      throw new Error('HSTS missing');
    return response;
  };
  const health = await (await get('/healthz')).json();
  if (
    health.revision !== manifest.revision ||
    health.releaseDigest !== manifest.digest ||
    health.kind !== 'catalog-shell'
  )
    throw new Error('Deployed release mismatch');
  const checked = [];
  for (const file of manifest.files) {
    const response = await get(`/${file.path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length !== file.size ||
      sha256(bytes) !== file.sha256 ||
      response.headers.get('content-type') !== file.type
    )
      throw new Error(`${file.path}: deployed asset mismatch`);
    checked.push(file.path);
  }
  const route = new Uint8Array(
    await (await get('/g/unpublished-title')).arrayBuffer(),
  );
  if (
    sha256(route) !==
    manifest.files.find((file) => file.path === 'index.html').sha256
  )
    throw new Error('Deep link shell mismatch');
  await get('/_demo', 404);
  await get('/?demo=true', 400);
  return { verified: true, origin, revision: manifest.revision, checked };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(
        await verifyHostedCatalog(
          process.argv[2],
          loadCatalog('dist/catalog').manifest,
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
