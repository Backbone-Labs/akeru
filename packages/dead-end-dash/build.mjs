/** Build an explicitly supplied checkout of the pinned Dead End Dash source
 * into ignored artifacts. The working tree is never read and no script, hook
 * or filter from the checkout is run: committed objects are read through Git
 * plumbing and bundled with the root's pinned esbuild. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The one source this recipe builds: where it lives, which commit, and what
// the files read from that commit hash to. All three change together.
export const sourceUrl = 'https://github.com/HyperLightAlex/dead-end-dash';
export const revision = 'e0dc31c5b2523487cce1f63d3802aa4279533f60';
export const sourceDigest =
  '6383389298eb914492552968dc9e7486c5e9ac0737d18aadab4da76e271f3da1';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
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

/** `git@github.com:owner/repo.git` and its HTTPS forms name one repository. */
export function normalizeRemote(remote) {
  const url = String(remote)
    .trim()
    .replace(/^git@([^:/]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(url))
    throw new Error('Unsupported Dead End Dash remote');
  return url;
}

/** Regular committed files only: a link or submodule is never followed. */
export function regularBlobs(tree) {
  return new Set(
    String(tree)
      .split('\n')
      .map((line) => /^100(?:644|755) blob [a-f0-9]+\t(.+)$/.exec(line)?.[1])
      .filter(Boolean),
  );
}

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

/** One value for everything read from the pinned commit. */
export const digestSources = (sources) =>
  hash(
    JSON.stringify(
      [...sources]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, sha256]) => ({ path, sha256 })),
    ),
  );

export async function buildDeadEndDash(
  source,
  out = here('../../dist/dead-end-dash/'),
  pin = { sourceUrl, revision, sourceDigest },
) {
  if (!source) throw new Error('Pass the path to the Dead End Dash checkout');
  // Plumbing only, with replacement objects and the checkout's monitor hook
  // off. Nothing here compares against the working tree, so no clean filter
  // or hook configured in the checkout has a reason to run.
  const git = (args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-C',
        resolve(source),
        ...args,
      ],
      {
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: {
          ...process.env,
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
        },
      },
    );
  let head, remote;
  try {
    head = git(['rev-parse', '--verify', 'HEAD']).toString().trim();
  } catch {
    throw new Error('Not a Dead End Dash checkout: ' + source);
  }
  if (head !== pin.revision)
    throw new Error('Unexpected Dead End Dash source revision');
  try {
    remote = git(['config', '--get', 'remote.origin.url']).toString();
  } catch {
    throw new Error('Dead End Dash checkout has no origin remote');
  }
  if (normalizeRemote(remote) !== pin.sourceUrl)
    throw new Error('Dead End Dash checkout is not from the pinned repository');
  const tracked = regularBlobs(git(['ls-tree', '-r', pin.revision]));
  const selected = new Map();
  const read = (path) => {
    if (!tracked.has(path))
      throw new Error('Dead End Dash source file is missing: ' + path);
    const bytes = git(['cat-file', 'blob', `${pin.revision}:${path}`]);
    selected.set(path, hash(bytes));
    return bytes;
  };
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
    // endpoint a release recipe or the local preview replaces.
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
  // Git object ids are not re-verified on every read. This is: the bytes
  // read are the bytes that were reviewed when the pin was last changed.
  const digest = digestSources(selected);
  if (pin.sourceDigest !== undefined && digest !== pin.sourceDigest)
    throw new Error(
      `Dead End Dash source does not match its pinned digest (read ${digest})`,
    );
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(new URL(name, out), bytes);
  writeFileSync(
    new URL('build-record.json', out),
    JSON.stringify(
      {
        revision: pin.revision,
        sourceUrl: pin.sourceUrl,
        sourceDigest: digest,
        version,
        source: [...selected]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([path, sha256]) => ({ path, sha256 })),
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
    sourceDigest: digest,
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
