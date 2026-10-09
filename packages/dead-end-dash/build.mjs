/** Build an explicitly supplied checkout of the pinned Dead End Dash source
 * into ignored artifacts. Committed objects are read through `pinned.mjs` and
 * bundled with the root's pinned esbuild; nothing from the checkout is run. */
import { build } from 'esbuild';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  hash,
  openPinned,
  revision,
  sourceDigest,
  sourceUrl,
} from './pinned.mjs';

// How the adapter names a module of the game: `dead-end-dash:src/game.js`.
const prefix = 'dead-end-dash:';
const here = (path) => new URL(path, import.meta.url);
// The typeface is the only third-party file in the game. Its licence text
// travels with it.
const fonts = {
  'pixelify-sans-400.woff2':
    'assets/fonts/pixelify-sans-latin-400-normal.woff2',
  'pixelify-sans-700.woff2':
    'assets/fonts/pixelify-sans-latin-700-normal.woff2',
  'OFL-Pixelify-Sans.txt': 'assets/fonts/OFL-Pixelify-Sans.txt',
};

/** Where a relative import inside the game points. The game imports nothing
 * but its own modules, its stylesheet and its typeface. */
export function resolveGameImport(importer, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../'))
    throw new Error('Game source imports a package: ' + specifier);
  const path = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (
    !/^src\/[A-Za-z0-9/._-]+\.js$/.test(path) &&
    path !== 'src/ui/styles.css' &&
    !Object.values(fonts).includes(path)
  )
    throw new Error('Unexpected game source import: ' + path);
  return path;
}

/** The title origin's policy admits its own files only. */
export function checkStylesheet(css) {
  if (/url\(|@import|@font-face/i.test(css))
    throw new Error('Game stylesheet loads another resource');
  return css;
}

export async function buildDeadEndDash(
  source,
  out = here('../../dist/dead-end-dash/'),
  pin = { sourceUrl, revision, sourceDigest },
) {
  const { read, seal } = openPinned(source, pin);
  const { version } = JSON.parse(read('package.json'));
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Unexpected Dead End Dash version');
  const files = new Map();
  const put = (name, bytes) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || files.has(name))
      throw new Error('Unsafe artifact name');
    files.set(name, Buffer.from(bytes));
  };
  const pinnedSource = {
    name: 'dead-end-dash-pinned-source',
    setup(builder) {
      builder.onResolve({ filter: /^dead-end-dash:/ }, ({ path }) => ({
        path: resolveGameImport('.', './' + path.slice(prefix.length)),
        namespace: 'pinned',
      }));
      builder.onResolve(
        { filter: /.*/, namespace: 'pinned' },
        ({ path, importer }) => ({
          path: resolveGameImport(importer, path),
          namespace: 'pinned',
        }),
      );
      builder.onLoad({ filter: /.*/, namespace: 'pinned' }, ({ path }) =>
        // The standalone game inlines its stylesheet and typeface. Here they
        // are separate files on the title origin, so those imports are empty.
        path.endsWith('.js')
          ? { contents: read(path).toString(), loader: 'js' }
          : { contents: 'export default "";', loader: 'js' },
      );
    },
  };
  const bundle = await build({
    entryPoints: ['packages/dead-end-dash/src/title.js'],
    // Paths in the output are relative to the repository, wherever it is
    // built from, so the same commit always gives the same bytes.
    absWorkingDir: fileURLToPath(here('../../')),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // Served as their own files: the host's save client, and the party
    // endpoint, which the local preview replaces.
    external: ['./save-client.js', './network-config.js'],
    // The game leaves its own controller polling, on-screen pad, storage and
    // other hosts' transports out of a bundle built for a host.
    define: { __DED_TARGET__: '"embedded"' },
    plugins: [pinnedSource],
    // Folds the target test above so the unused branches are really gone.
    minifySyntax: true,
    legalComments: 'none',
    logLevel: 'silent',
    write: false,
  });
  put('title.js', bundle.outputFiles[0].contents);
  put('game.css', checkStylesheet(read('src/ui/styles.css').toString()));
  for (const [name, path] of Object.entries(fonts)) put(name, read(path));
  for (const name of ['index.html', 'adapter.css', 'network-config.js'])
    put(name, readFileSync(here('./src/' + name)));
  put('save-client.js', readFileSync(here('../contracts/src/save-client.js')));
  const sealed = seal(pin.sourceDigest);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(new URL(name, out), bytes);
  writeFileSync(
    new URL('build-record.json', out),
    JSON.stringify(
      {
        revision: pin.revision,
        sourceUrl: pin.sourceUrl,
        sourceDigest: sealed.digest,
        version,
        source: sealed.source,
        approval:
          'Local evaluation only; source rights, asset rights and publication have not been reviewed',
        artifacts: readdirSync(out)
          .sort()
          .map((path) => ({
            path,
            sha256: hash(readFileSync(new URL(path, out))),
          })),
      },
      null,
      2,
    ),
  );
  return {
    revision: pin.revision,
    sourceUrl: pin.sourceUrl,
    sourceDigest: sealed.digest,
    version,
    files: [...files.keys()].sort(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await buildDeadEndDash(process.argv[2]);
  console.log('Built Dead End Dash from pinned checkout');
}
