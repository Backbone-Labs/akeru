/** Explicit public evaluation bundle. Does not approve or activate production titles. */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { playableTitles } from '../examples/catalog-demo/titles.mjs';
import { startCatalogDemo } from '../examples/catalog-demo/server.mjs';
import { validateCatalog } from '../platform/catalog/model.js';
const out = resolve('dist/public-preview');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const put = (dir, path, bytes) => {
  const target = resolve(dir, path);
  if (!target.startsWith(dir + '/')) throw new Error('Unsafe bundle path');
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, bytes);
};
const headers = (csp) => [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), gamepad=(self)',
  },
];
const config = (csp, rewrites = [], noStore = false) => ({
  framework: null,
  buildCommand: null,
  installCommand: null,
  headers: [
    {
      source: '/(.*)',
      headers: [
        ...headers(csp),
        ...(noStore ? [{ key: 'Cache-Control', value: 'no-store' }] : []),
      ],
    },
  ],
  rewrites,
});
const sourceArchive = execFileSync(
  'git',
  ['archive', '--format=tar.gz', 'HEAD'],
  { maxBuffer: 64 * 1024 * 1024 },
);
const titleOptions = playableTitles().filter((title) => {
  if (!title.publicationBlocked) return true;
  console.log(
    'Excluded ' + title.manifest.id + ': ' + title.publicationBlocked,
  );
  return false;
});
const demo = await startCatalogDemo({ titles: titleOptions });
try {
  const catalog = await (await fetch(demo.url + '/catalog.json')).json();
  const originsFile = process.argv[2];
  const origins = originsFile ? JSON.parse(readFileSync(originsFile)) : null;
  for (const [index, entry] of catalog.entries.entries()) {
    const id = entry.manifest.id;
    const dir = resolve(out, 'titles', id);
    const options = titleOptions[index];
    for (const artifact of entry.manifest.artifacts) {
      const response = await fetch(
        `${entry.release.origin}/releases/${entry.release.digest}/${artifact.path}`,
      );
      if (!response.ok) throw new Error('Missing title artifact: ' + id);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== artifact.sha256)
        throw new Error('Artifact mismatch: ' + id);
      put(dir, `releases/${entry.release.digest}/${artifact.path}`, bytes);
    }
    put(dir, 'sources/akeru-source.tar.gz', sourceArchive);
    // Provide the pinned engine and game-data source alongside GPL engine builds.
    if (['freedoom1', 'freedoom2', 'freedm'].includes(id)) {
      const sourceDir = process.env.AKERU_FREEDOOM_SOURCE_ARCHIVES;
      if (!sourceDir) throw new Error('Set AKERU_FREEDOOM_SOURCE_ARCHIVES');
      for (const kind of ['engine', 'data']) {
        const bytes = readFileSync(resolve(sourceDir, kind + '.tar'));
        const expected = JSON.parse(
          readFileSync(resolve('dist', id, 'build-record.json')),
        ).sources[kind].archiveSha256;
        if (hash(bytes) !== expected)
          throw new Error('Source archive mismatch');
        put(dir, `sources/${kind}.tar.gz`, gzipSync(bytes));
      }
    }
    if (id === 'anarch') {
      if (!process.env.ANARCH_SOURCE) throw new Error('Set ANARCH_SOURCE');
      put(
        dir,
        'sources/upstream.tar.gz',
        execFileSync(
          'git',
          [
            '-C',
            process.env.ANARCH_SOURCE,
            'archive',
            '--format=tar.gz',
            entry.manifest.provenance.source.revision,
          ],
          { maxBuffer: 64 * 1024 * 1024 },
        ),
      );
    }
    put(
      dir,
      'vercel.json',
      JSON.stringify(
        config(
          `default-src 'none'; script-src 'self' ${options.wasm ? "'wasm-unsafe-eval'" : ''}; style-src 'self'; img-src 'self'; connect-src ${options.wasm ? "'self'" : "'none'"}; frame-ancestors https://backbone-akeru.vercel.app; base-uri 'none'; form-action 'none'; object-src 'none'`,
        ),
        null,
        2,
      ),
    );
    if (origins) {
      if (!origins[id]) throw new Error('Missing deployed origin: ' + id);
      entry.release.origin = origins[id];
      entry.metadata.notices.push({
        label: 'Akeru source and build recipes ↗',
        url: origins[id] + '/sources/akeru-source.tar.gz',
      });
      if (['freedoom1', 'freedoom2', 'freedm'].includes(id))
        for (const kind of ['engine', 'data'])
          entry.metadata.notices.push({
            label: 'Pinned ' + kind + ' source ↗',
            url: origins[id] + '/sources/' + kind + '.tar.gz',
          });
      if (id === 'anarch')
        entry.metadata.notices.push({
          label: 'Pinned upstream source ↗',
          url: origins[id] + '/sources/upstream.tar.gz',
        });
    }
  }
  const shell = resolve(out, 'shell');
  const files = [
    'index.html',
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
  ];
  for (const file of files) {
    let bytes = readFileSync(resolve('platform/catalog', file));
    if (file === 'index.html')
      bytes = Buffer.from(
        bytes
          .toString()
          .replace('LOCAL PREVIEW', 'PUBLIC PREVIEW')
          .replace(
            '</head>',
            `<meta name="akeru-catalog-release" content="${hash(JSON.stringify(catalog))}" /></head>`,
          ),
      );
    put(shell, file, bytes);
  }
  for (const file of [
    'browser.js',
    'index.js',
    'normalize.js',
    'preferences.js',
    'overlay.js',
    'styles.css',
  ])
    put(
      shell,
      'input/' + file,
      readFileSync(resolve('packages/input/src', file)),
    );
  put(
    shell,
    'player.html',
    readFileSync(resolve(shell, 'index.html'), 'utf8')
      .replace('<body>', '<body class="direct-player">')
      .replace('Opening Akeru…', 'Opening game…'),
  );
  put(shell, 'saves/index.js', readFileSync('packages/saves/src/index.js'));
  // Remove model assets left by an older bundle; onboarding no longer loads 3D.
  rmSync(resolve(shell, 'local-controller.glb'), { force: true });
  rmSync(resolve(shell, 'vendor/three'), { recursive: true, force: true });
  put(
    shell,
    'bootstrap.js',
    "import {mountCatalog} from '/app.js';import {createBrowserInputProvider} from '/input/browser.js';mountCatalog({mode:'demo',inputProviderFactory:createBrowserInputProvider});",
  );
  for (const entry of catalog.entries) {
    const file = resolve('dist/previews', entry.manifest.id + '.png');
    if (existsSync(file))
      put(shell, 'previews/' + entry.manifest.id + '.png', readFileSync(file));
  }
  put(shell, 'sources/akeru-source.tar.gz', sourceArchive);
  if (origins)
    validateCatalog(catalog, {
      mode: 'demo',
      shellOrigin: 'https://backbone-akeru.vercel.app',
    });
  put(shell, 'catalog.json', JSON.stringify(catalog));
  put(
    shell,
    'vercel.json',
    JSON.stringify(
      config(
        `default-src 'none'; script-src 'self' ; style-src 'self'; img-src 'self' https://backbone.com; connect-src 'self'; frame-src ${origins ? Object.values(origins).join(' ') : "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        [
          { source: '/games', destination: '/index.html' },
          { source: '/settings', destination: '/index.html' },
          { source: '/g/:id', destination: '/index.html' },
          { source: '/play/:id', destination: '/player.html' },
        ],
        true,
      ),
      null,
      2,
    ),
  );
  put(
    out,
    'bundle.json',
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        ready: !!origins,
        titles: catalog.entries.map((e) => e.manifest.id),
      },
      null,
      2,
    ),
  );
  console.log(
    `Packaged ${catalog.entries.length} public evaluation titles. Shell deployment ready: ${!!origins}`,
  );
} finally {
  await demo.close();
}
