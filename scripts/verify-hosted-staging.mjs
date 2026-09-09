import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './package-staging.mjs';
import { shellHeaders } from './serve-staging.mjs';

export async function verifyHostedStaging(origin, release, fetcher = fetch) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Use an exact HTTPS origin without path or credentials');
  const checked = [];
  const get = async path => {
    const response = await fetcher(`${origin}${path}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
    for (const [key, value] of Object.entries(shellHeaders)) {
      if (response.headers.get(key) !== value) throw new Error(`${path}: missing or changed ${key}`);
    }
    if (!/max-age=[1-9][0-9]*/u.test(response.headers.get('strict-transport-security') ?? '')) throw new Error(`${path}: HSTS missing`);
    return response;
  };
  const health = await (await get('/healthz')).json();
  if (health.revision !== release.revision || health.gamesEnabled !== false || health.status !== 'ok') throw new Error('Unexpected deployed revision or state');
  for (const file of release.files) {
    if (!/^[a-zA-Z0-9.-]+$/u.test(file.path)) throw new Error('Invalid manifest path');
    const bytes = new Uint8Array(await (await get(`/${file.path}`)).arrayBuffer());
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`${file.path}: deployed digest mismatch`);
    checked.push(file.path);
  }
  return { origin, revision: release.revision, checked, verified: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const release = JSON.parse(readFileSync('dist/staging/release.json'));
    console.log(JSON.stringify(await verifyHostedStaging(process.argv[2], release), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
