export function originSet(value) {
  const values = value.split(',').filter(Boolean);
  if (!values.length) throw Error('ALLOWED_ORIGINS is required');
  for (const v of values) {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.origin !== v || u.username || u.password)
      throw Error('Origins must be exact HTTPS origins');
  }
  return new Set(values);
}
export function allowUpgrade(req, allowed, count, limit = 128) {
  return req.url === '/ws' && allowed.has(req.headers.origin) && count < limit;
}
