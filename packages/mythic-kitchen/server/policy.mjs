/** Bounded guest admission; Origin is a browser boundary, not user authentication. */
export function parseOrigins(value) {
  const origins = new Set((value || '').split(',').filter(Boolean));
  if (!origins.size) throw new Error('TITLE_ORIGINS is required');
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    )
      throw new Error('Expected exact HTTPS title origins');
  }
  return origins;
}
export function allowUpgrade(req, origins, clients, maximum = 64) {
  return (
    req.method === 'GET' &&
    req.url === '/ws' &&
    origins.has(req.headers.origin) &&
    clients < maximum
  );
}
export function takeControlToken(ws, now) {
  ws.controlTokens = Math.min(
    12,
    ws.controlTokens + (Math.max(0, now - ws.controlAt) / 1000) * 4,
  );
  ws.controlAt = now;
  if (ws.controlTokens < 1) return false;
  ws.controlTokens--;
  return true;
}
