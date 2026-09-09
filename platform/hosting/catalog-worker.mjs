// Catalog code and title code are separate deployment units. No credentials or
// privileged service bindings are forwarded to asset requests.
export function catalogHeaders(titleOrigins = []) {
  if (
    !Array.isArray(titleOrigins) ||
    titleOrigins.some((origin) => {
      try {
        return (
          new URL(origin).origin !== origin || !origin.startsWith('https://')
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('Expected exact HTTPS title origins');
  return {
    'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; frame-src ${titleOrigins.length ? [...new Set(titleOrigins)].join(' ') : "'none'"}; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), gamepad=(self)',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
}
export function createCatalogWorker(release) {
  const headers = catalogHeaders(release.titleOrigins);
  if (
    !/^[a-f0-9]{40}$/.test(release.revision) ||
    !/^[a-f0-9]{64}$/.test(release.digest)
  )
    throw new Error('Invalid release identity');
  const types = new Set([
    'text/html; charset=utf-8',
    'text/css; charset=utf-8',
    'text/javascript; charset=utf-8',
    'application/json; charset=utf-8',
    'text/plain; charset=utf-8',
    'application/gzip',
  ]);
  const files = new Map();
  for (const file of release.files) {
    if (
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9.]+$/.test(file.path) ||
      file.path.includes('..') ||
      files.has(`/${file.path}`) ||
      !types.has(file.type) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid release file');
    files.set(`/${file.path}`, file);
  }
  if (!files.has('/index.html') || !files.has('/catalog.json'))
    throw new Error('Missing catalog entry');
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const respond = (status, body, type = 'text/plain; charset=utf-8') =>
        new Response(request.method === 'HEAD' ? null : body, {
          status,
          headers: {
            ...headers,
            'Content-Type': type,
            ...(url.protocol === 'https:'
              ? { 'Strict-Transport-Security': 'max-age=31536000' }
              : {}),
          },
        });
      if (!['GET', 'HEAD'].includes(request.method))
        return respond(405, 'Method not allowed');
      if (url.search) return respond(400, 'Query parameters are not supported');
      if (url.pathname === '/healthz')
        return respond(
          200,
          JSON.stringify({
            status: 'ok',
            revision: release.revision,
            releaseDigest: release.digest,
            kind: 'catalog-shell',
          }),
          'application/json; charset=utf-8',
        );
      const match = /^\/g\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
      const route = url.pathname === '/' || (match && match[1].length <= 64);
      const path = route ? '/index.html' : url.pathname;
      const file = files.get(path);
      if (!file) return respond(404, 'Not found');
      try {
        const asset = await env.ASSETS.fetch(
          new Request(`https://assets.invalid${path}`, { redirect: 'manual' }),
        );
        if (asset.status !== 200) return respond(503, 'Catalog unavailable');
        const bytes = await asset.arrayBuffer();
        const digest = [
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        ]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        if (bytes.byteLength !== file.size || digest !== file.sha256)
          return respond(503, 'Catalog unavailable');
        return respond(200, bytes, file.type);
      } catch {
        return respond(503, 'Catalog unavailable');
      }
    },
  };
}
