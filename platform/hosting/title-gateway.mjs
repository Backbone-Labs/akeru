import { createStagingWorker } from './worker.mjs';

// One gateway per host-allocated title origin. Configuration and REGISTRY are
// operator-owned: title manifests/messages cannot grant these authorities.
export function createTitleGateway({ titleId, titleOrigin, shellOrigin, versions, headers }) {
  const canonical = origin => new URL(origin).protocol === 'https:' && new URL(origin).origin === origin;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(titleId) || !canonical(titleOrigin) || !canonical(shellOrigin) || titleOrigin === shellOrigin) throw new Error('Invalid isolated title identity');
  const ancestors = headers?.['Content-Security-Policy']?.split(';').map(s => s.trim()).find(s => s.startsWith('frame-ancestors '));
  if (ancestors !== `frame-ancestors ${shellOrigin}`) throw new Error('Title CSP must bind the expected shell');
  if (!Array.isArray(versions) || !versions.length) throw new Error('No retained releases');
  const allowedTypes = new Set(['text/html', 'text/html; charset=utf-8', 'text/javascript', 'application/javascript', 'text/css', 'application/json', 'application/wasm', 'application/octet-stream', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'font/woff', 'font/woff2']);
  const retained = new Map(), entries = new Map(), files = [];
  for (const version of versions) {
    if (!/^[a-f0-9]{64}$/u.test(version.digest) || retained.has(version.digest) || !Array.isArray(version.files)) throw new Error('Invalid retained release');
    const paths = new Set();
    for (const file of version.files) {
      if (typeof file.path !== 'string' || !/^[a-zA-Z0-9._/-]+$/u.test(file.path) || file.path.split('/').some(p => !p || p === '.' || p === '..') || paths.has(file.path)
        || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/u.test(file.sha256) || !allowedTypes.has(file.type)
        || file.type !== file.type.trim() || /[\r\n]/u.test(file.type)) throw new Error('Invalid retained artifact');
      paths.add(file.path);
      const path = `releases/${version.digest}/${file.path}`;
      files.push({ ...file, path });
      // Every HTML document is a new launch surface, not just the primary entry.
      if (file.type.toLowerCase().startsWith('text/html')) entries.set(`/${path}`, version.digest);
    }
    const entry = `/releases/${version.digest}/${version.entry}`;
    if (entries.get(entry) !== version.digest) throw new Error('Entry must be a retained HTML artifact');
    retained.set(version.digest, entry);
  }
  const assets = createStagingWorker({ files }, headers);
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const respond = (status, body, extra = {}) => new Response(request.method === 'HEAD' ? null : body, { status,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Strict-Transport-Security': 'max-age=31536000', ...extra } });
      if (url.origin !== titleOrigin) return respond(421, 'Wrong title origin');
      if (!['GET', 'HEAD'].includes(request.method)) return respond(405, 'Method not allowed');
      if (url.search) return respond(400, 'Query strings are not supported');
      if (url.pathname === '/' || entries.has(url.pathname)) {
        let current;
        try {
          const response = await env.REGISTRY.fetch(new Request(`https://registry.invalid/titles/${titleId}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) }));
          if (response.status !== 200) throw new Error('Registry unavailable');
          current = await response.json();
          if (current.id !== titleId || typeof current.paused !== 'boolean' || !retained.has(current.current)) throw new Error('Invalid title state');
        } catch { return respond(503, 'Title state unavailable'); }
        if (current.paused) return respond(410, 'Title unavailable');
        if (url.pathname === '/') return respond(302, '', { Location: retained.get(current.current) });
        if (entries.get(url.pathname) !== current.current) return respond(409, 'Release changed; launch again');
      } else if (!files.some(file => `/${file.path}` === url.pathname)) return respond(404, 'Not found');
      return assets.fetch(request, env);
    },
  };
}
