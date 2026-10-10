/** Who may open a party connection, and how much one instance carries.
 * Origin is a browser boundary, not authentication: a program that is not a
 * browser sends whatever Origin it likes. */

// The relay's own defaults suit a server that has a machine to itself. These
// are for one small container; everything not named here keeps its default.
export const limits = Object.freeze({
  maxSockets: 256,
  maxRooms: 128,
  // Once a burst as large as `maxSockets` is spent: the relay lets a full
  // house back in at once after a restart, then holds arrivals to this.
  acceptPerSecond: 20,
});

/** `TITLE_ORIGINS`: the exact origins the title is served from, separated by
 * commas. HTTPS only, apart from a loopback address for local evaluation. */
export function parseOrigins(value) {
  const origins = new Set(
    String(value ?? '')
      .split(',')
      .filter(Boolean),
  );
  if (!origins.size) throw new Error('TITLE_ORIGINS is required');
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('Expected exact HTTPS title origins');
    }
    if (
      url.origin !== origin ||
      // A pattern is not an origin: it would be accepted and match nobody.
      !/^[a-z0-9.-]+$/.test(url.hostname) ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    )
      throw new Error('Expected exact HTTPS title origins');
  }
  return origins;
}

/** One path, one method, and a page served from a listed origin. */
export function admit(req, origins) {
  return (
    req.method === 'GET' &&
    req.url === '/ws' &&
    typeof req.headers.origin === 'string' &&
    origins.has(req.headers.origin)
  );
}
