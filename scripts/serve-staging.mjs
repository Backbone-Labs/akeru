import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './package-staging.mjs';
import { createContainedFileReader } from './read-contained-file.mjs';

const fileTypes = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'LICENSE.txt': 'text/plain; charset=utf-8',
  'source.tar.gz': 'application/gzip',
  'provenance.json': 'application/json; charset=utf-8',
};
export const shellHeaders = Object.freeze({
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), gamepad=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
});

// Verify the complete allowlisted release before listening, then hold immutable bytes
// in memory. No request-controlled filesystem access or dynamic code execution.
export function loadStaging(directory) {
  const reader = createContainedFileReader(directory);
  const { root } = reader;
  const read = (name) => {
    try {
      return reader.read(name);
    } catch (error) {
      throw new Error(`Release requires regular file: ${name}`, {
        cause: error,
      });
    }
  };
  const metadata = read('release.json');
  const release = JSON.parse(metadata);
  if (
    release.schemaVersion !== '1.0.0' ||
    release.kind !== 'staging-shell' ||
    !/^[a-f0-9]{40}$/u.test(release.revision)
  )
    throw new Error('Invalid staging release');
  const expected = Object.keys(fileTypes).sort();
  if (
    !Array.isArray(release.files) ||
    JSON.stringify(release.files.map((f) => f.path).sort()) !==
      JSON.stringify(expected) ||
    JSON.stringify(readdirSync(root).sort()) !==
      JSON.stringify([...expected, 'release.json'].sort())
  ) {
    throw new Error('Unexpected or missing release files');
  }
  const files = new Map();
  for (const entry of release.files) {
    const bytes = read(entry.path);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256)
      throw new Error(`Digest mismatch: ${entry.path}`);
    files.set(`/${entry.path}`, { bytes, type: fileTypes[entry.path] });
  }
  const source = JSON.parse(files.get('/provenance.json').bytes);
  if (
    source.revision !== release.revision ||
    source.artifact.sha256 !== sha256(files.get('/source.tar.gz').bytes)
  ) {
    throw new Error('Source provenance mismatch');
  }
  files.set('/release.json', {
    bytes: metadata,
    type: 'application/json; charset=utf-8',
  });
  return { release, files, digest: sha256(metadata) };
}
export function createStagingServer(directory) {
  const loaded = loadStaging(directory);
  return createServer((request, response) => {
    const send = (status, type, bytes) => {
      response.writeHead(status, {
        ...shellHeaders,
        'Content-Type': type,
        'Content-Length': bytes.length,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    if (!['GET', 'HEAD'].includes(request.method))
      return send(405, 'text/plain', Buffer.from('Method not allowed\n'));
    const path = request.url?.split('?')[0];
    if (path === '/healthz')
      return send(
        200,
        'application/json',
        Buffer.from(
          JSON.stringify({
            status: 'ok',
            revision: loaded.release.revision,
            releaseDigest: loaded.digest,
            gamesEnabled: false,
          }),
        ),
      );
    const file = loaded.files.get(path === '/' ? '/index.html' : path);
    if (!file) return send(404, 'text/plain', Buffer.from('Not found\n'));
    send(200, file.type, file.bytes);
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const port = Number(process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid PORT');
    // Deliberately local-only; use a reviewed HTTPS deployment adapter for staging.
    createStagingServer(process.argv[2] ?? 'dist/staging').listen(
      port,
      '127.0.0.1',
      () => console.log(`Staging preview: http://127.0.0.1:${port}`),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
