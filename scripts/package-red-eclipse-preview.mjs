/** Package reviewed Red Eclipse browser inputs without deploying or activating a game. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateManifest } from '../packages/contracts/src/index.js';
import { validateCatalog } from '../platform/catalog/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
export const PUBLIC_SHELL = 'https://backbone-akeru.vercel.app';
const REVISION = 'faf378d12558addc700d0e464e7e8c3a39fbceee';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const json = (x) => JSON.stringify(x, null, 2) + '\n';
const escape = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function exactOrigin(value, protocol = 'https:') {
  const u = new URL(value);
  if (u.protocol !== protocol || u.origin !== value || u.username || u.password)
    throw Error(`Expected exact ${protocol} origin`);
  return value;
}
export function relayEndpoint(value) {
  const u = new URL(value);
  if (
    u.protocol !== 'wss:' ||
    u.username ||
    u.password ||
    u.pathname !== '/relay' ||
    u.search ||
    u.hash
  )
    throw Error('Expected fixed WSS /relay endpoint');
  return u.href;
}
export function appendCatalog(catalog, entry, replaceDigest) {
  const existing = catalog.entries.findIndex(
    (e) => e.manifest.id === entry.manifest.id,
  );
  if (
    existing >= 0 &&
    (!replaceDigest ||
      entry.manifest.id !== 'red-eclipse' ||
      catalog.entries[existing].release.digest !== replaceDigest)
  )
    throw Error('Existing title needs explicit review of its current digest');
  if (existing < 0 && replaceDigest)
    throw Error('Expected title to replace is absent');
  const copy = structuredClone(catalog);
  if (existing >= 0) copy.entries[existing] = structuredClone(entry);
  else copy.entries.push(structuredClone(entry));
  validateCatalog(copy, { mode: 'demo', shellOrigin: PUBLIC_SHELL });
  return copy;
}
export function filesUnder(dir) {
  const out = [];
  for (const item of readdirSync(dir)) {
    if (item.startsWith('.')) continue;
    const p = resolve(dir, item),
      s = lstatSync(p);
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
export function configForTitle(endpoint, ancestors = [PUBLIC_SHELL]) {
  relayEndpoint(endpoint);
  ancestors.forEach((x) => exactOrigin(x));
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
            value: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${new URL(endpoint).origin}; worker-src 'none'; frame-ancestors ${ancestors.join(' ')}; base-uri 'none'; form-action 'none'; object-src 'none'`,
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
export async function verifyBaseline(baseline) {
  const paths = filesUnder(baseline).map((p) => relative(baseline, p));
  const results = [];
  for (const path of paths) {
    if (
      path === 'vercel.json' ||
      path.startsWith('sources/') ||
      path.endsWith('.tar.gz') ||
      path === 'registry.mjs'
    )
      continue;
    const local = readFileSync(resolve(baseline, path));
    const response = await fetch(
      `${PUBLIC_SHELL}/${path}?red-eclipse-baseline=1`,
    );
    if (!response.ok)
      throw Error(`Live baseline unavailable: ${path} (${response.status})`);
    const remote = Buffer.from(await response.arrayBuffer());
    if (hash(local) !== hash(remote))
      throw Error(
        `Live baseline differs: ${path}; do not overwrite current site`,
      );
    results.push({ path, sha256: hash(local) });
  }
  return results;
}
export function sanitizeRecipe(text, python = false) {
  const paths = [
    [resolve(root, '../../Akeru/tmp/red-eclipse'), 'build'],
    ['/tmp/akeru-red-eclipse-browser-source', 'engine'],
    ['/tmp/akeru-red-eclipse-port-source', 'upstream'],
    ['/tmp/akeru-red-eclipse-emsdk', 'emsdk'],
    ['/tmp/red-eclipse-audio', 'audio'],
  ];
  if (python) {
    text =
      'import os\n' +
      text.replace(
        /(['"])(\/(?:Users|tmp)\/[^'"\n]*)\1/g,
        (all, quote, path) => {
          const mapping = paths.find(([prefix]) => path.startsWith(prefix));
          if (!mapping) return all.replace('/tmp/', './');
          return `os.path.join(os.environ['RED_ECLIPSE_WORKSPACE'], ${JSON.stringify(mapping[1] + path.slice(mapping[0].length))})`;
        },
      );
  } else
    for (const [prefix, replacement] of paths)
      text = text.replaceAll(prefix, '${RED_ECLIPSE_WORKSPACE}/' + replacement);
  if (/\/Users\//.test(text)) throw Error('Private home path in recipe');
  return text;
}
function sourceArchives(title, engineDir, assetDir) {
  const stage = resolve(root, 'dist/red-eclipse/source-staging');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const engineSource = '/tmp/akeru-red-eclipse-browser-source';
  mkdirSync(resolve(engineSource, 'doc'), { recursive: true });
  for (const name of ['license.txt', 'all-licenses.txt', 'trademark.txt'])
    copyFileSync(
      resolve('/tmp/akeru-red-eclipse-port-source/doc', name),
      resolve(engineSource, 'doc', name),
    );
  const archive = (name, cwd, args) => {
    const dest = resolve(title, 'sources', name);
    mkdirSync(dirname(dest), { recursive: true });
    execFileSync(
      'tar',
      [
        '-czf',
        dest,
        '--exclude=.git',
        '--exclude=.DS_Store',
        '--exclude=*.log',
        '--exclude=compile-results.json',
        '-C',
        cwd,
        ...args,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return { path: 'sources/' + name, sha256: hash(readFileSync(dest)) };
  };
  const dataIndex = [
    ...readFileSync(resolve(engineDir, 'red-eclipse-opt.js'), 'utf8').matchAll(
      /filename:"([^"]+)",start:([\d.eE+-]+),end:([\d.eE+-]+)/g,
    ),
  ].map((match) => ({
    path: match[1],
    start: Number(match[2]),
    end: Number(match[3]),
  }));
  if (!dataIndex.length) throw Error('Missing preloaded asset index');
  put(stage, 'data-index.json', json(dataIndex));
  put(
    stage,
    'unpack-data.py',
    `import os, json, pathlib, sys
workspace = pathlib.Path(os.environ['RED_ECLIPSE_WORKSPACE'])
blob = pathlib.Path(sys.argv[1]).read_bytes()
entries = json.loads(pathlib.Path(__file__).with_name('data-index.json').read_text())
for entry in entries:
    name = entry['path'].lstrip('/')
    if '..' in pathlib.PurePosixPath(name).parts:
        raise ValueError('Unsafe archive path')
    if name.startswith('data/'):
        dest = workspace / 'build/release-data' / name
    elif name.startswith('config/'):
        dest = workspace / 'engine' / name
    elif name == 'init.cfg':
        dest = workspace / 'build/scene-data/init.cfg'
    else:
        raise ValueError('Unknown preload path: ' + name)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(blob[entry['start']:entry['end']])
`,
  );
  const archives = [];
  archives.push(
    archive('engine-source.tar.gz', '/tmp/akeru-red-eclipse-browser-source', [
      'src',
      'config',
      'doc',
    ]),
  );
  archives.push(
    archive('libsndfile-source.tar.gz', '/tmp/red-eclipse-audio', [
      'libsndfile',
    ]),
  );
  for (const p of [
    'build-web-optimized.py',
    'link-web-optimized.py',
    'web-diagnostics.cpp',
    'engine-post.js',
    'web-opt-link.json',
    'prepare-release-assets.py',
    'convert-release-audio.py',
    'audit-release-assets.py',
  ])
    writeFileSync(
      resolve(stage, p),
      sanitizeRecipe(
        readFileSync(resolve(engineDir, p), 'utf8'),
        p.endsWith('.py'),
      ),
    );
  for (const p of [
    'CREDITS.md',
    'release-manifest.json',
    'audio-conversions.json',
  ])
    copyFileSync(resolve(assetDir, p), resolve(stage, p));
  const audioBuild = JSON.parse(
    readFileSync(resolve(engineDir, 'audio-build.json'), 'utf8'),
  );
  put(
    stage,
    'libsndfile-build.sh',
    '#!/bin/sh\nset -eu\n: "${RED_ECLIPSE_WORKSPACE:?Set absolute workspace directory}"\n' +
      sanitizeRecipe(audioBuild.commands.slice(1, 7).join('\n')) +
      '\n',
  );
  put(
    stage,
    'libsndfile-build-inputs.json',
    json({
      source: audioBuild.source,
      toolchain: audioBuild.toolchain,
      license: audioBuild.license.spdx,
      archiveSha256: audioBuild.sha256,
    }),
  );
  put(
    stage,
    'RELINK.txt',
    `This modified Red Eclipse browser build uses libsndfile 1.2.2 under LGPL 2.1+.\nEngine sources, original library sources, browser adapter source, compiled engine objects, decoder archive and link recipe are provided so you can replace libsndfile and relink.\nUse Emscripten 4.0.15. Set RED_ECLIPSE_WORKSPACE to an absolute directory containing engine/ (modified sources), upstream/ (git checkout at pinned revision), emsdk/, audio/ (libsndfile source and install), and build/ (recipes, relink objects and release-data/). Recipes resolve paths relative to that environment variable. Before linking, run python3 unpack-data.py /path/to/downloaded/red-eclipse-opt.data to reconstruct the exact preloaded assets and init.cfg.\nAsset source URLs and hashes are in release-manifest.json. All modified source is identified as this browser adaptation.\n`,
  );
  archives.push(archive('build-recipes.tar.gz', stage, ['.']));
  archives.push(
    archive('relink-objects.tar.gz', engineDir, [
      'web-build-opt',
      'web-diagnostics.o',
    ]),
  );
  archives.push(
    archive('libsndfile-build.tar.gz', '/tmp/red-eclipse-audio', ['install']),
  );
  archives.push(
    archive('adapter-source.tar.gz', root, [
      'LICENSE',
      'package.json',
      'package-lock.json',
      'packages/red-eclipse',
      'scripts/package-red-eclipse-preview.mjs',
    ]),
  );
  return archives;
}
export async function packageRedEclipse({
  baseline,
  endpoint,
  origin,
  engineDir,
  assetDir,
  previewOrigin,
  replaceDigest,
  titlesOnly = false,
  skipLiveBaseline = false,
} = {}) {
  relayEndpoint(endpoint);
  if (origin) {
    exactOrigin(origin);
    if (
      origin === PUBLIC_SHELL ||
      origin === endpoint.replace('wss:', 'https:')
    )
      throw Error('Title origin must be isolated');
    if (
      !/^https:\/\/[a-z0-9-]+-[a-z0-9]{9,12}-[a-z0-9-]+\.vercel\.app$/.test(
        origin,
      )
    )
      throw Error('Title needs immutable Vercel deployment origin');
  }
  if (!titlesOnly && (!origin || !baseline))
    throw Error('Shell requires --origin and --baseline');
  const ancestors = [PUBLIC_SHELL];
  if (previewOrigin) ancestors.push(exactOrigin(previewOrigin));
  const liveBaseline =
    !titlesOnly && !skipLiveBaseline
      ? await verifyBaseline(resolve(baseline))
      : [];
  const out = resolve(root, 'dist/red-eclipse'),
    title = resolve(out, 'title'),
    stage = resolve(out, 'release-staging');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  rmSync(resolve(title, 'releases'), { recursive: true, force: true });
  mkdirSync(title, { recursive: true });
  for (const name of ['index.html', 'title.js', 'input.js', 'style.css'])
    put(
      stage,
      name,
      readFileSync(resolve(root, 'packages/red-eclipse/src', name)),
    );
  put(
    stage,
    'runtime-config.js',
    `export const relayUrl=${JSON.stringify(endpoint)};\nexport const allowedShellOrigins=${JSON.stringify(ancestors)};\n`,
  );
  for (const name of [
    'red-eclipse-opt.js',
    'red-eclipse-opt.wasm',
    'red-eclipse-opt.data',
  ])
    put(
      stage,
      name,
      name.endsWith('.js')
        ? readFileSync(resolve(engineDir, name), 'utf8').replaceAll(
            resolve(engineDir, 'red-eclipse-opt.data'),
            'red-eclipse-opt.data',
          )
        : readFileSync(resolve(engineDir, name)),
    );
  put(stage, 'CREDITS.md', readFileSync(resolve(assetDir, 'CREDITS.md')));
  put(
    stage,
    'credits.html',
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Red Eclipse browser adaptation — credits</title><body><pre>${escape(readFileSync(resolve(assetDir, 'CREDITS.md'), 'utf8'))}</pre><p><a href="release-manifest.json">Per-file source, license and modification inventory</a></p><p><a href="/sources/engine-source.tar.gz">Modified engine source</a> · <a href="/sources/libsndfile-source.tar.gz">libsndfile source</a> · <a href="/sources/relink-objects.tar.gz">Relinkable objects</a> · <a href="/sources/build-recipes.tar.gz">Build recipes</a></p></body></html>`,
  );
  put(
    stage,
    'dependency-notices.json',
    readFileSync(resolve(assetDir, 'dependency-notices.json')),
  );
  put(
    stage,
    'release-manifest.json',
    readFileSync(resolve(assetDir, 'release-manifest.json')),
  );
  for (const p of filesUnder(resolve(assetDir, 'notices')))
    put(
      stage,
      'notices/' + relative(resolve(assetDir, 'notices'), p),
      readFileSync(p),
    );
  const artifacts = filesUnder(stage).map((p) => ({
    path: relative(stage, p),
    sha256: hash(readFileSync(p)),
  }));
  const manifest = {
    specVersion: '0.1.0',
    id: 'red-eclipse',
    version: '0.1.0',
    sdk: { range: '^0.1.0' },
    title: 'Red Eclipse — Browser Preview',
    entry: 'index.html',
    artifacts,
    provenance: {
      source: {
        url: 'https://github.com/redeclipse/base',
        revision: REVISION,
        license: 'Zlib',
        rightsStatus: 'documented',
      },
      assets: artifacts.map((a) => ({
        path: a.path,
        kind: 'generated',
        license: a.path.endsWith('.data')
          ? 'Mixed; see release-manifest.json'
          : 'Mixed; see credits.html',
        evidence: [
          `https://github.com/redeclipse/base/blob/${REVISION}/doc/license.txt`,
        ],
      })),
    },
    input: { controller: true, touch: true },
    runtime: {
      graphics: { preferred: 'webgl2', fallback: null },
      requiredFeatures: ['wasm'],
      optionalFeatures: [],
    },
    capabilities: ['save.local'],
    saves: { schemaVersion: 1, guestLocal: true, accountSync: 'disabled' },
  };
  const result = validateManifest(manifest);
  if (!result.valid) throw Error(result.errors.join('; '));
  const digest = hash(JSON.stringify(manifest));
  for (const p of filesUnder(stage))
    put(title, `releases/${digest}/${relative(stage, p)}`, readFileSync(p));
  put(title, 'vercel.json', json(configForTitle(endpoint, ancestors)));
  const sources = sourceArchives(title, engineDir, assetDir);
  const entry = {
    manifest,
    release: {
      digest,
      origin: origin ?? 'https://red-eclipse-pending.invalid',
    },
    metadata: {
      summary:
        'Fast arena action. Join the same multiplayer match in your browser.',
      description:
        'An independently modified browser preview of Red Eclipse. Fight in Fortitude with other players. This is an early port and is not an official Red Eclipse release. Live matches are not saved or paused for other players.',
      category: 'action',
      creator: 'Red Eclipse Team and contributors',
      ageLabel: 'Unrated — shooting and combat',
      controls: {
        controller: [
          'Left stick: move. Right stick: look. RT: fire. A: jump.',
          'LT: alternate fire. X: reload. B: crouch. Y: use. RB: special. LB: walk.',
        ],
        touch: [
          'Left stick: move. Right stick: aim. RT: fire. A: jump. X: reload.',
          'Keyboard/mouse: WASD, mouse look, left click to fire, Space to jump.',
        ],
      },
      privacy: [
        'Guest multiplayer connects to the dedicated Akeru preview server. Gameplay position and actions are shared with match participants.',
        'No account is required. Live matches do not support save states.',
      ],
      notices: [
        {
          label: 'Original Red Eclipse project',
          url: 'https://www.redeclipse.net/',
        },
        {
          label: 'Credits, licenses and browser modifications',
          url:
            (origin ?? 'https://red-eclipse-pending.invalid') +
            `/releases/${digest}/credits.html`,
        },
      ],
      cover: '/previews/red-eclipse.png',
    },
    availability: 'available',
  };
  const report = { digest, entry, sources, liveBaseline, shellReady: false };
  if (!titlesOnly) {
    const shell = resolve(out, 'shell');
    rmSync(shell, { recursive: true, force: true });
    for (const p of filesUnder(resolve(baseline)))
      put(shell, relative(resolve(baseline), p), readFileSync(p));
    const catalog = appendCatalog(
      JSON.parse(readFileSync(resolve(baseline, 'catalog.json'), 'utf8')),
      entry,
      replaceDigest,
    );
    const bytes = JSON.stringify(catalog),
      release = hash(bytes);
    put(shell, 'catalog.json', bytes);
    put(
      shell,
      'previews/red-eclipse.png',
      readFileSync(resolve(assetDir, 'data/maps/fortitude.png')),
    );
    for (const page of ['index.html', 'player.html']) {
      const html = readFileSync(resolve(shell, page), 'utf8');
      const pattern =
        /(<meta name="akeru-catalog-release" content=")[a-f0-9]{64}("\s*\/?>)/;
      if (!pattern.test(html)) throw Error('Missing catalog marker');
      put(shell, page, html.replace(pattern, `$1${release}$2`));
    }
    const cfg = JSON.parse(readFileSync(resolve(shell, 'vercel.json'), 'utf8'));
    const csp = cfg.headers
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === 'content-security-policy');
    if (!csp || !csp.value.includes('frame-src '))
      throw Error('Missing shell frame-src');
    csp.value = csp.value.replace(
      /frame-src ([^;]+)/,
      (_all, old) => `frame-src ${old} ${origin}`,
    );
    put(shell, 'vercel.json', json(cfg));
    report.shellReady = !skipLiveBaseline;
    report.catalogCount = catalog.entries.length;
  }
  put(out, 'bundle.json', json(report));
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const opts = {};
  const names = {
    '--baseline': 'baseline',
    '--endpoint': 'endpoint',
    '--origin': 'origin',
    '--engine-dir': 'engineDir',
    '--asset-dir': 'assetDir',
    '--preview-origin': 'previewOrigin',
    '--replace-digest': 'replaceDigest',
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--titles-only') opts.titlesOnly = true;
    else if (a === '--skip-live-baseline') opts.skipLiveBaseline = true;
    else if (names[a] && process.argv[i + 1])
      opts[names[a]] = process.argv[++i];
    else throw Error('Unknown option ' + a);
  }
  const r = await packageRedEclipse(opts);
  console.log(
    json({
      digest: r.digest,
      shellReady: r.shellReady,
      catalogCount: r.catalogCount,
    }),
  );
}
