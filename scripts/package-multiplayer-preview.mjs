/** Add two multiplayer releases to an existing public evaluation site; never deploys. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCatalogDemo } from '../examples/catalog-demo/server.mjs';
import { options as kartOptions } from '../packages/old-san-juan-kart/catalog.mjs';
import { blacklineOptions } from '../packages/operation-blackline/catalog.mjs';
import { validateCatalog } from '../platform/catalog/model.js';
import { createContainedFileReader } from './read-contained-file.mjs';
import { packageSource } from './package-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const PUBLIC_SHELL = 'https://backbone-akeru.vercel.app';
export const MULTIPLAYER_TITLES = ['old-san-juan-kart', 'operation-blackline'];
export const BASELINE_ASSETS = [
  'index.html',
  'player.html',
  'favicon.svg',
  'backbone-pro.png',
  'style.css',
  'app.js',
  'home.js',
  'onboarding.js',
  'promotions.js',
  'controller-model.js',
  'model.js',
  'channel.js',
  'save-channel.js',
  'rumble.js',
  'bootstrap.js',
  'catalog.json',
  'vercel.json',
  'input/browser.js',
  'input/index.js',
  'input/normalize.js',
  'input/preferences.js',
  'input/overlay.js',
  'input/styles.css',
  'saves/index.js',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const git = (...args) =>
  execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
function put(dir, path, bytes) {
  if (path.split('/').some((part) => !part || part.startsWith('.')))
    throw Error('Unsafe output path');
  const target = resolve(dir, path);
  if (!target.startsWith(dir + '/')) throw Error('Unsafe output path');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}
export function httpsOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw Error('Expected an exact HTTPS origin');
  return url.origin;
}
function replaceOnce(text, before, after, label) {
  if (
    !text.includes(before) ||
    text.indexOf(before) !== text.lastIndexOf(before)
  )
    throw Error(`Baseline ${label} anchor changed; review before packaging`);
  return text.replace(before, after);
}
export function patchBaselineApp(text) {
  text = replaceOnce(
    text,
    '  inputProviderFactory,',
    '  inputProviderFactory,\n  inputMappingFactory,\n  multiplayerServiceFactory,',
    'factory arguments',
  );
  text = replaceOnce(
    text,
    '      input = inputProviderFactory({ titleId: id });',
    '      input = inputProviderFactory({ titleId: id, ...(inputMappingFactory ? { mapping: inputMappingFactory(id) } : {}) });',
    'title input',
  );
  return replaceOnce(
    text,
    '      saveService: savesFor(entry).service,',
    '      saveService: savesFor(entry).service,\n      multiplayerService: multiplayerServiceFactory?.(entry),',
    'runtime service',
  );
}
export function safeMultiplayerChannel(baseline, current) {
  let expected = replaceOnce(
    baseline,
    '  saveService,',
    '  saveService,\n  multiplayerService,',
    'channel arguments',
  );
  expected = replaceOnce(
    expected,
    '    saves.dispose();',
    '    saves.dispose();\n    multiplayerService?.dispose();',
    'channel dispose',
  );
  expected = replaceOnce(
    expected,
    '    const p = v.payload;',
    `    const p = v.payload;
    if (v.type === 'multiplayer') {
      if (
        !['playable', 'paused'].includes(state) ||
        (state === 'paused' && p?.action === 'input') ||
        !multiplayerService?.receive(p)
      )
        return false;
      received = v.sequence;
      return true;
    }`,
    'channel receive',
  );
  expected = replaceOnce(
    expected,
    "      state = 'playable';\n      clearTimeout(timeout);",
    "      state = 'playable';\n      clearTimeout(timeout);\n      multiplayerService?.connect((payload) => send('multiplayer', payload));",
    'channel connect',
  );
  const nonceHelper =
    /\n\/\*\* Secure entropy is available on LAN HTTP previews even without randomUUID\. \*\/\nexport function createRuntimeNonce\(provider = globalThis\.crypto\) \{[\s\S]*?\n\}\n?$/;
  if (current.replace(nonceHelper, '').trim() !== expected.trim())
    throw Error(
      'Runtime channel has changes beyond the reviewed additive multiplayer hooks',
    );
  return current;
}
export function copyBaselineAssets(baselineDir, shell) {
  const reader = createContainedFileReader(baselineDir);
  const catalog = JSON.parse(reader.read('catalog.json', 'utf8'));
  validateCatalog(catalog, { mode: 'demo', shellOrigin: PUBLIC_SHELL });
  const names = new Set(BASELINE_ASSETS);
  for (const entry of catalog.entries)
    if (entry.metadata.cover) names.add(entry.metadata.cover.slice(1));
  const files = [];
  // Explicit filenames only: never walk the baseline directory or inspect dotfiles.
  for (const name of [...names].sort()) {
    const bytes = reader.read(name);
    put(shell, name, bytes);
    files.push({ path: name, sha256: hash(bytes), size: bytes.length });
  }
  return { reader, catalog, files };
}
function titleConfig(ancestors) {
  return {
    framework: null,
    buildCommand: null,
    installCommand: null,
    headers: [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors ${ancestors.join(' ')}; base-uri 'none'; form-action 'none'; object-src 'none'`,
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
function updateCsp(config, endpoint, entries) {
  const copy = structuredClone(config);
  const rules = copy.headers?.filter((rule) => rule.source === '/(.*)');
  const csp = rules
    ?.flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === 'content-security-policy');
  if (csp?.length !== 1) throw Error('Expected one baseline shell CSP');
  const replaceDirective = (name, value) => {
    const pattern = new RegExp(`(^|;\\s*)${name} [^;]*`, 'g');
    if ((csp[0].value.match(pattern) || []).length !== 1)
      throw Error(`Expected one ${name} directive`);
    csp[0].value = csp[0].value.replace(
      pattern,
      (_match, prefix) => `${prefix}${name} ${value}`,
    );
  };
  replaceDirective(
    'connect-src',
    `'self' ${endpoint} ${endpoint.replace('https:', 'wss:')}`,
  );
  replaceDirective(
    'frame-src',
    [...new Set(entries.map((entry) => entry.release.origin))].join(' '),
  );
  return copy;
}
export async function packageMultiplayerPreview({
  baseline,
  endpoint,
  originsFile,
  titlesOnly = false,
  previewShellOrigin,
  preflight = false,
} = {}) {
  if (!titlesOnly && (!baseline || !endpoint || !originsFile))
    throw Error('Full packaging requires --baseline, --endpoint and --origins');
  if (endpoint) httpsOrigin(endpoint);
  const ancestors = [PUBLIC_SHELL];
  if (previewShellOrigin && previewShellOrigin !== PUBLIC_SHELL)
    ancestors.push(httpsOrigin(previewShellOrigin));
  const origins = originsFile
    ? JSON.parse(readFileSync(originsFile, 'utf8'))
    : null;
  if (origins) {
    if (
      Object.keys(origins).length !== 2 ||
      MULTIPLAYER_TITLES.some((id) => !Object.hasOwn(origins, id))
    )
      throw Error(
        'Approved origins file must contain exactly the two multiplayer titles',
      );
    for (const origin of Object.values(origins)) {
      httpsOrigin(origin);
      if (ancestors.includes(origin) || origin === endpoint)
        throw Error('Titles need separate immutable origins');
      if (
        new URL(origin).hostname.endsWith('.vercel.app') &&
        !/^https:\/\/[a-z0-9-]+-[a-z0-9]{9,12}-[a-z0-9-]+\.vercel\.app$/.test(
          origin,
        )
      )
        throw Error(
          'Use the immutable Vercel deployment origin, not a mutable alias',
        );
    }
    if (new Set(Object.values(origins)).size !== 2)
      throw Error('Titles need distinct origins');
  }
  const out = resolve(root, 'dist/public-multiplayer');
  if (
    baseline &&
    (resolve(baseline) === out || resolve(baseline).startsWith(out + '/'))
  )
    throw Error('Baseline cannot be inside the output directory');
  // Final source packaging uses only reviewed, clean, tracked Git blobs. A preflight
  // may inspect current title code, but its HEAD source archive is explicitly not release-ready.
  let sourceArchive, source;
  if (preflight) {
    const revision = git('rev-parse', 'HEAD').toString().trim();
    sourceArchive = git('archive', '--format=tar.gz', revision);
    source = {
      revision,
      sha256: hash(sourceArchive),
      matchesWorkingTree: false,
    };
  } else {
    const provenance = packageSource(root);
    sourceArchive = readFileSync(
      resolve(root, 'dist/source', provenance.artifact.filename),
    );
    source = {
      revision: provenance.revision,
      sha256: provenance.artifact.sha256,
      matchesWorkingTree: true,
    };
  }
  for (const file of [
    'packages/old-san-juan-kart/build.mjs',
    'packages/operation-blackline/build.mjs',
    'packages/multiplayer/build.mjs',
  ])
    execFileSync(process.execPath, [file], { cwd: root, stdio: 'inherit' });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const options = [kartOptions({ multiplayer: true }), blacklineOptions()];
  const demo = await startCatalogDemo({ titles: options });
  try {
    const fresh = demo.catalog;
    const titleRecords = [];
    for (const [index, entry] of fresh.entries.entries()) {
      const id = entry.manifest.id,
        dir = resolve(out, 'titles', id);
      if (!MULTIPLAYER_TITLES.includes(id)) throw Error('Unexpected title');
      for (const artifact of entry.manifest.artifacts) {
        // Use the verified build bytes already passed to the local host. No
        // network response can supply executable files for the release.
        const bytes = options[index].titleFiles[artifact.path];
        if (!bytes) throw Error(`Missing ${id} artifact`);
        if (hash(bytes) !== artifact.sha256)
          throw Error(`Artifact mismatch: ${id}/${artifact.path}`);
        put(dir, `releases/${entry.release.digest}/${artifact.path}`, bytes);
      }
      put(dir, 'sources/akeru-source.tar.gz', sourceArchive);
      put(dir, 'vercel.json', json(titleConfig(ancestors)));
      if (origins) entry.release.origin = origins[id];
      titleRecords.push({
        id,
        digest: entry.release.digest,
        artifacts: entry.manifest.artifacts.length,
        origin: origins?.[id] ?? null,
        assetRequests: !!options[index].assetRequests,
      });
    }
    const report = {
      source,
      deployable: !preflight,
      shellReady: !titlesOnly && !preflight,
      titlesOnly,
      endpoint: endpoint ?? null,
      frameAncestors: ancestors,
      titles: titleRecords,
    };
    if (!titlesOnly) {
      const shell = resolve(out, 'shell');
      const original = copyBaselineAssets(baseline, shell);
      const updates = new Map(
        fresh.entries.map((entry) => [entry.manifest.id, entry]),
      );
      const catalog = structuredClone(original.catalog);
      catalog.entries = catalog.entries.map((entry) => {
        const replacement = updates.get(entry.manifest.id);
        if (!replacement) return entry;
        // Keep existing artwork and order. Only the requested game's release and metadata change.
        if (entry.metadata.cover)
          replacement.metadata.cover = entry.metadata.cover;
        updates.delete(entry.manifest.id);
        return replacement;
      });
      catalog.entries.push(...updates.values());
      for (const entry of catalog.entries.filter((e) =>
        MULTIPLAYER_TITLES.includes(e.manifest.id),
      )) {
        entry.metadata.notices.push({
          label: 'Akeru source and build recipes ↗',
          url: entry.release.origin + '/sources/akeru-source.tar.gz',
        });
        const option = options.find((o) => o.manifest.id === entry.manifest.id);
        if (
          entry.metadata.cover &&
          !original.catalog.entries.some(
            (old) => old.metadata.cover === entry.metadata.cover,
          )
        ) {
          if (!option.previewImage) throw Error('Missing new title artwork');
          put(shell, entry.metadata.cover.slice(1), option.previewImage);
        }
      }
      validateCatalog(catalog, { mode: 'demo', shellOrigin: PUBLIC_SHELL });
      const beforeById = new Map(
        original.catalog.entries.map((entry) => [entry.manifest.id, entry]),
      );
      const untouched = catalog.entries.filter(
        (e) => !MULTIPLAYER_TITLES.includes(e.manifest.id),
      );
      for (const entry of untouched)
        if (
          JSON.stringify(entry) !==
          JSON.stringify(beforeById.get(entry.manifest.id))
        )
          throw Error('Unrelated catalog entry changed');
      if (
        untouched.length !==
        original.catalog.entries.filter(
          (e) => !MULTIPLAYER_TITLES.includes(e.manifest.id),
        ).length
      )
        throw Error('Existing games were removed');
      const app = patchBaselineApp(original.reader.read('app.js', 'utf8'));
      put(shell, 'app.js', app);
      put(
        shell,
        'channel.js',
        safeMultiplayerChannel(
          original.reader.read('channel.js', 'utf8'),
          readFileSync(resolve(root, 'platform/catalog/channel.js'), 'utf8'),
        ),
      );
      put(
        shell,
        'multiplayer.js',
        readFileSync(resolve(root, 'dist/multiplayer/browser.js')),
      );
      put(
        shell,
        'bootstrap.js',
        `import {mountCatalog} from '/app.js';import {createBrowserInputProvider} from '/input/browser.js';import {createCatalogMultiplayerFactory,catalogInputMapping} from '/multiplayer.js';mountCatalog({mode:'demo',inputProviderFactory:createBrowserInputProvider,inputMappingFactory:catalogInputMapping,multiplayerServiceFactory:createCatalogMultiplayerFactory({endpoints:${JSON.stringify(Object.fromEntries(MULTIPLAYER_TITLES.map((id) => [id, endpoint])))}})});\n`,
      );
      const bytes = JSON.stringify(catalog);
      const release = hash(bytes);
      for (const page of ['index.html', 'player.html']) {
        const html = original.reader.read(page, 'utf8');
        const marker =
          /(<meta name="akeru-catalog-release" content=")[a-f0-9]{64}("\s*\/?>)/;
        if (!marker.test(html)) throw Error('Baseline catalog marker changed');
        put(shell, page, html.replace(marker, `$1${release}$2`));
      }
      put(shell, 'catalog.json', bytes);
      put(
        shell,
        'vercel.json',
        json(
          updateCsp(
            JSON.parse(original.reader.read('vercel.json', 'utf8')),
            endpoint,
            catalog.entries,
          ),
        ),
      );
      put(shell, 'sources/akeru-source.tar.gz', sourceArchive);
      put(shell, 'akeru-source.tar.gz', sourceArchive);
      report.baseline = {
        catalogSha256: hash(original.reader.read('catalog.json')),
        files: original.files,
      };
      report.catalog = {
        before: original.catalog.entries.length,
        after: catalog.entries.length,
        unchanged: untouched.map((e) => e.manifest.id),
        changed: catalog.entries
          .filter((e) => MULTIPLAYER_TITLES.includes(e.manifest.id))
          .map((entry) => ({
            id: entry.manifest.id,
            before: beforeById.get(entry.manifest.id) ?? null,
            after: entry,
          })),
      };
      report.assets = original.files.map((file) => ({
        path: file.path,
        before: file.sha256,
        after: hash(readFileSync(resolve(shell, file.path))),
      }));
      report.shellCatalogSha256 = release;
    }
    put(out, 'bundle.json', json(report));
    console.log(
      `Packaged ${titlesOnly ? 'two title projects' : `${report.catalog.after} games (${report.catalog.unchanged.length} untouched)`}. ${preflight ? 'PREFLIGHT ONLY: not deployable.' : 'No deployment performed.'}`,
    );
    return report;
  } finally {
    await demo.close();
  }
}
function argumentsFor(argv) {
  const result = {};
  const keys = {
    '--baseline': 'baseline',
    '--endpoint': 'endpoint',
    '--origins': 'originsFile',
    '--preview-shell-origin': 'previewShellOrigin',
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--titles-only') result.titlesOnly = true;
    else if (arg === '--preflight') result.preflight = true;
    else if (keys[arg] && argv[index + 1] && !argv[index + 1].startsWith('--'))
      result[keys[arg]] = argv[++index];
    else throw Error(`Unknown or incomplete option: ${arg}`);
  }
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await packageMultiplayerPreview(argumentsFor(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
