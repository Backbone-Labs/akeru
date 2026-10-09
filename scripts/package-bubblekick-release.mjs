/**
 * Package a built BUBBLE KICK title (dist/bubblekick, see packages/bubblekick/build.mjs) for the public
 * evaluation site. Nothing is deployed by this script.
 *
 *   node scripts/package-bubblekick-release.mjs title [--ancestor https://extra-shell-origin]
 *     -> dist/bubblekick-release/title  (deploy to the dedicated game project; record its origin)
 *   node scripts/package-bubblekick-release.mjs shell --origin <title origin> --baseline <live shell dir> --cover <png>
 *     -> dist/bubblekick-release/shell  (the verified live shell plus exactly one new entry)
 */
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../packages/contracts/src/index.js';
import { validateCatalog } from '../platform/catalog/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const PUBLIC_SHELL = 'https://backbone-akeru.vercel.app';
export const ID = 'bubblekick';
const ADAPTER_SOURCE = 'https://github.com/Backbone-Labs/akeru';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const json = (x) => JSON.stringify(x, null, 2) + '\n';

export function exactOrigin(value, protocol = 'https:') {
  const u = new URL(value);
  if (u.protocol !== protocol || u.origin !== value || u.username || u.password)
    throw Error(`Expected exact ${protocol} origin: ${value}`);
  return value;
}

export function filesUnder(dir) {
  const out = [];
  for (const item of readdirSync(dir)) {
    if (item.startsWith('.')) continue;
    const p = resolve(dir, item);
    const s = lstatSync(p);
    if (s.isSymbolicLink()) throw Error('Symlinks are not release inputs');
    if (s.isDirectory()) out.push(...filesUnder(p));
    else if (s.isFile()) out.push(p);
  }
  return out.sort();
}

function put(base, path, bytes) {
  const p = resolve(base, path);
  if (!p.startsWith(base + '/')) throw Error('Escaping output path');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, bytes);
}

/** Static hosting config for the isolated title origin. */
export function titleConfig(server, ancestors = [PUBLIC_SHELL]) {
  ancestors.forEach((a) => exactOrigin(a));
  const connect = server
    ? `'self' ${new URL(server).origin} ${new URL(server).origin.replace('wss:', 'https:')}`
    : "'self'";
  return {
    framework: null,
    buildCommand: null,
    installCommand: null,
    headers: [
      {
        source: '/releases/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src ${connect}; worker-src 'none'; frame-ancestors ${ancestors.join(' ')}; base-uri 'none'; form-action 'none'; object-src 'none'`,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), gamepad=(self)',
          },
        ],
      },
    ],
  };
}

export const METADATA = {
  summary: 'Roll, pass and score in five-a-side bubble soccer.',
  description:
    'Pick a critter and play a quick match against the CPU or share a keyboard for couch play. Three stadiums, charged shots and penalty shootouts. Online rooms are not enabled in this preview.',
  category: 'sports',
  controls: {
    controller: [
      'Left stick moves. A shoots or tackles, B passes, X lobs, Y / LB / RB switches player. D-pad browses menus; A selects and B goes back.',
    ],
    touch: [
      'Use the on-screen stick and action buttons. Tap menus to choose a match. Keyboard: WASD move; J/Space shoot; K pass; I lob; L switch.',
    ],
  },
  creator: 'Kishan Patel',
  ageLabel: 'Unrated',
  privacy: [
    'Settings and lifetime match records are saved on this device through Akeru. Live matches cannot be saved or restored. No cloud sync.',
    'This release plays locally; no online game server is connected.',
  ],
  notices: [
    {
      label: 'Three.js license',
      url: 'https://github.com/mrdoob/three.js/blob/r180/LICENSE',
    },
  ],
  cover: '/previews/bubblekick.png',
};

/** Stage the immutable title deployment from dist/bubblekick. */
export function packageTitle({ adapterRevision, ancestors = [PUBLIC_SHELL] }) {
  if (!/^[0-9a-f]{40}$/.test(adapterRevision ?? ''))
    throw Error('Pass the Akeru adapter commit (--adapter-revision)');
  const built = resolve(root, 'dist/bubblekick');
  const record = JSON.parse(
    readFileSync(resolve(built, 'build-record.json'), 'utf8'),
  );
  const files = filesUnder(built)
    .map((p) => relative(built, p))
    .filter((p) => p !== 'build-record.json');
  for (const a of record.artifacts)
    if (hash(readFileSync(resolve(built, a.path))) !== a.sha256)
      throw Error(`Built file changed: ${a.path}`);
  const manifest = {
    specVersion: '0.1.0',
    id: ID,
    version: '0.1.0',
    sdk: { range: '^0.1.0' },
    title: 'Bubble Kick',
    entry: 'index.html',
    artifacts: files.map((path) => ({
      path,
      sha256: hash(readFileSync(resolve(built, path))),
    })),
    provenance: {
      source: {
        url: ADAPTER_SOURCE,
        revision: adapterRevision,
        license: 'unknown',
        rightsStatus: 'unknown',
      },
      assets: files.map((path) => ({
        path,
        kind: 'generated',
        license: 'unknown',
        evidence: [ADAPTER_SOURCE],
      })),
    },
    input: { controller: true, touch: true },
    runtime: {
      graphics: { preferred: 'webgl2', fallback: null },
      requiredFeatures: [],
      optionalFeatures: [],
    },
    capabilities: ['save.local'],
    saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
  };
  const check = validateManifest(manifest);
  if (check && check.valid === false)
    throw Error('Invalid manifest: ' + JSON.stringify(check.errors ?? check));
  const digest = hash(JSON.stringify(manifest));
  const out = resolve(root, 'dist/bubblekick-release');
  const title = resolve(out, 'title');
  rmSync(title, { recursive: true, force: true });
  for (const path of files)
    put(
      title,
      `releases/${digest}/${path}`,
      readFileSync(resolve(built, path)),
    );
  put(title, 'vercel.json', json(titleConfig(record.server, ancestors)));
  const entry = {
    manifest,
    release: { digest, origin: 'https://bubblekick-pending.invalid' },
    metadata: record.server
      ? {
          ...METADATA,
          description:
            'Pick a critter and play five-a-side bubble soccer against the CPU, on the couch, or online. Create a room and share its code with friends. Three stadiums, charged shots and penalty shootouts.',
          privacy: [
            METADATA.privacy[0],
            'Online play sends a display name and game inputs to the Backbone-hosted Bubble Kick server. Rooms are temporary and end when empty or the server restarts. No account or chat.',
          ],
        }
      : METADATA,
    availability: 'available',
  };
  put(out, 'entry.json', json(entry));
  return {
    digest,
    server: record.server,
    revision: record.revision,
    files: files.length,
  };
}

/** Fail unless every shipped baseline file is byte-identical to the live site. */
export async function verifyBaseline(baseline) {
  const results = [];
  for (const path of filesUnder(baseline).map((p) => relative(baseline, p))) {
    if (
      path === 'vercel.json' ||
      path.startsWith('sources/') ||
      path.endsWith('.tar.gz') ||
      path === 'registry.mjs'
    )
      continue;
    const local = readFileSync(resolve(baseline, path));
    const response = await fetch(
      `${PUBLIC_SHELL}/${path}?bubblekick-baseline=1`,
    );
    if (!response.ok)
      throw Error(`Live baseline unavailable: ${path} (${response.status})`);
    const remote = Buffer.from(await response.arrayBuffer());
    if (hash(local) !== hash(remote))
      throw Error(
        `Live baseline differs: ${path}; do not overwrite the current site`,
      );
    results.push(path);
  }
  return results;
}

export function appendCatalog(catalog, entry, replaceDigest = null) {
  const at = catalog.entries.findIndex(
    (e) => e.manifest.id === entry.manifest.id,
  );
  if (at >= 0 && catalog.entries[at].release.digest !== replaceDigest)
    throw Error(
      'BUBBLE KICK is already in this catalog; pass --replace-digest <its current digest> to replace it',
    );
  if (at < 0 && replaceDigest)
    throw Error('Expected BUBBLE KICK release to replace is absent');
  const copy = structuredClone(catalog);
  if (at >= 0) copy.entries[at] = structuredClone(entry);
  else copy.entries.push(structuredClone(entry));
  validateCatalog(copy, { mode: 'demo', shellOrigin: PUBLIC_SHELL });
  return copy;
}

/** Copy the verified live shell and add exactly the BUBBLE KICK entry, cover and frame origin. */
export async function packageShell({
  baseline,
  origin,
  cover = resolve(root, 'packages/bubblekick/artwork/cover.png'),
  replaceDigest = null,
  skipLiveBaseline = false,
}) {
  exactOrigin(origin);
  if (
    !/^https:\/\/backbone-akeru-games-[a-z0-9]{9,12}-backbone-labs\.vercel\.app$/.test(
      origin,
    )
  )
    throw Error('Title needs an immutable game-project deployment origin');
  baseline = resolve(baseline);
  const verified = skipLiveBaseline ? [] : await verifyBaseline(baseline);
  const out = resolve(root, 'dist/bubblekick-release');
  const entry = JSON.parse(readFileSync(resolve(out, 'entry.json'), 'utf8'));
  entry.release.origin = origin;
  const shell = resolve(out, 'shell');
  rmSync(shell, { recursive: true, force: true });
  for (const p of filesUnder(baseline))
    put(shell, relative(baseline, p), readFileSync(p));
  const catalog = appendCatalog(
    JSON.parse(readFileSync(resolve(baseline, 'catalog.json'), 'utf8')),
    entry,
    replaceDigest,
  );
  const bytes = JSON.stringify(catalog);
  put(shell, 'catalog.json', bytes);
  const release = hash(bytes);
  for (const page of ['index.html', 'player.html']) {
    const file = resolve(shell, page);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const pattern =
      /(<meta name="akeru-catalog-release" content=")[a-f0-9]{64}("\s*\/?>)/;
    if (!pattern.test(html)) throw Error(`Missing catalog marker in ${page}`);
    put(shell, page, html.replace(pattern, `$1${release}$2`));
  }
  if (!cover || !existsSync(cover))
    throw Error('Pass --cover <png> for the catalog tile');
  const png = readFileSync(cover);
  if (png.subarray(1, 4).toString() !== 'PNG')
    throw Error('Cover must be a PNG');
  put(shell, `previews/${ID}.png`, png);
  const cfg = JSON.parse(readFileSync(resolve(shell, 'vercel.json'), 'utf8'));
  let patched = false;
  for (const rule of cfg.headers ?? [])
    for (const h of rule.headers ?? [])
      if (h.key === 'Content-Security-Policy' && /frame-src /.test(h.value)) {
        h.value = h.value.replace(
          /frame-src ([^;]+)/,
          (_all, old) => `frame-src ${old.trim()} ${origin}`,
        );
        patched = true;
      }
  if (!patched) throw Error('Missing shell frame-src');
  put(shell, 'vercel.json', json(cfg));
  return {
    catalogCount: catalog.entries.length,
    release,
    verified: verified.length,
    shellReady: !skipLiveBaseline,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = { ancestors: [PUBLIC_SHELL] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--ancestor') opts.ancestors.push(exactOrigin(rest[++i]));
    else if (a === '--adapter-revision') opts.adapterRevision = rest[++i];
    else if (a === '--origin') opts.origin = rest[++i];
    else if (a === '--baseline') opts.baseline = rest[++i];
    else if (a === '--cover') opts.cover = rest[++i];
    else if (a === '--skip-live-baseline') opts.skipLiveBaseline = true;
    else if (a === '--replace-digest') opts.replaceDigest = rest[++i];
    else throw Error(`Unknown argument ${a}`);
  }
  if (cmd === 'title') console.log(json(packageTitle(opts)));
  else if (cmd === 'shell') console.log(json(await packageShell(opts)));
  else throw Error('Usage: package-bubblekick-release.mjs title|shell ...');
}
