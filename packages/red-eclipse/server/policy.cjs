'use strict';
function allowedOrigins(value) {
  if (!value)
    throw new Error(
      'ALLOWED_ORIGINS must explicitly list deployed title origins',
    );
  const origins = new Set(value.split(','));
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('Invalid origin');
    }
    if (
      url.protocol !== 'https:' ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      origin.includes('*')
    )
      throw new Error('Exact HTTPS origins required');
  }
  return origins;
}
function upgradeAllowed({ ready, path, origin, clients }, origins) {
  return (
    ready === true && path === '/relay' && origins.has(origin) && clients < 8
  );
}
module.exports = { allowedOrigins, upgradeAllowed };
