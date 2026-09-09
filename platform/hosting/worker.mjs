// Worker code receives only the ASSETS binding, never account or native secrets.
export function createStagingWorker(release, headers) {
  const files = new Map(release.files.map((file) => [`/${file.path}`, file]));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const respond = (status, body, type = 'text/plain; charset=utf-8') =>
        new Response(request.method === 'HEAD' ? null : body, {
          status,
          headers: {
            ...headers,
            'Content-Type': type,
            'Cache-Control': 'no-store',
            ...(url.protocol === 'https:'
              ? { 'Strict-Transport-Security': 'max-age=31536000' }
              : {}),
          },
        });
      if (!['GET', 'HEAD'].includes(request.method))
        return respond(405, 'Method not allowed');
      if (url.pathname === '/healthz')
        return respond(
          200,
          JSON.stringify({
            status: 'ok',
            revision: release.revision,
            releaseDigest: release.digest,
            gamesEnabled: false,
          }),
          'application/json',
        );
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = files.get(path);
      if (!file) return respond(404, 'Not found');
      try {
        // Construct a new request: do not forward cookies, authorization, ranges or conditionals.
        const asset = await env.ASSETS.fetch(
          new Request(`https://assets.invalid${path}`, { redirect: 'manual' }),
        );
        if (asset.status !== 200) return respond(503, 'Release unavailable');
        const bytes = await asset.arrayBuffer();
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        ]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        if (bytes.byteLength !== file.size || hash !== file.sha256)
          return respond(503, 'Release unavailable');
        return respond(200, bytes, file.type);
      } catch {
        return respond(503, 'Release unavailable');
      }
    },
  };
}
