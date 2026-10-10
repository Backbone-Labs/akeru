/** Build the party relay runtime from the same pinned checkout as the title,
 * into ignored `dist/dead-end-dash-server/`. The result is a directory a
 * container can be made from. Nothing here builds an image, contacts a
 * registry or deploys anything. */
import { build, transform } from 'esbuild';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  hash,
  openPinned,
  revision,
  serverDigest,
  sourceUrl,
} from './pinned.mjs';

const here = (path) => new URL(path, import.meta.url);
// The one file of the game the runtime is made of, and the one package it
// needs. The entry point and admission policy are this package's own.
const relayPath = 'server/relay-core.mjs';
const own = ['index.mjs', 'policy.mjs'];
const dockerfile = [
  'FROM node:24.21.0-slim',
  'WORKDIR /app',
  'COPY --chown=node:node . .',
  'USER node',
  'ENV NODE_ENV=production PORT=8080',
  'EXPOSE 8080',
  'CMD ["node", "index.mjs"]',
  '',
].join('\n');

/** The relay is one module that imports one package. Anything else it reached
 * for would be missing from the runtime. The second check is a tripwire for
 * an honest change, not a sandbox: the relay is given no file, environment or
 * process access because it has never needed any, and a revision that starts
 * to should be read before it is pinned. */
export async function checkRelaySource(code) {
  const imports = [];
  await build({
    stdin: { contents: code, loader: 'js', sourcefile: 'relay-core.mjs' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [
      {
        name: 'dead-end-dash-relay-imports',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) => {
            imports.push(path);
            return { path, external: true };
          });
        },
      },
    ],
  });
  if (imports.length !== 1 || imports[0] !== 'ws')
    throw new Error(
      'Relay source imports something other than ws: ' + imports.join(', '),
    );
  // Comments are stripped first, so that prose cannot trip the check.
  const bare = (
    await transform(code, {
      loader: 'js',
      minifyWhitespace: true,
      legalComments: 'none',
    })
  ).code;
  const reach =
    /\bimport\s*\(|\brequire\b|\bprocess\b|\bglobalThis\b|\beval\b|\bFunction\b/.exec(
      bare,
    );
  if (reach)
    throw new Error('Relay source reaches outside itself: ' + reach[0]);
  return code;
}

export async function buildDeadEndDashServer(
  source,
  out = here('../../dist/dead-end-dash-server/'),
  pin = { sourceUrl, revision, serverDigest },
) {
  const { read, seal } = openPinned(source, pin);
  const game = JSON.parse(read('package.json'));
  if (!/^\d+\.\d+\.\d+$/.test(game.version))
    throw new Error('Unexpected Dead End Dash version');
  const relay = await checkRelaySource(read(relayPath).toString());
  // The exact WebSocket package the root lockfile records, as installed. The
  // game names the version its relay was written and tested against; a
  // different one here is a change somebody should look at first.
  const locked = JSON.parse(readFileSync(here('../../package-lock.json')))
    .packages['node_modules/ws'];
  const installed = JSON.parse(
    readFileSync(here('../../node_modules/ws/package.json')),
  );
  if (
    !locked?.integrity ||
    !/^\d+\.\d+\.\d+$/.test(locked.version) ||
    installed.version !== locked.version
  )
    throw new Error('Installed ws is not the one the root lockfile records');
  if (game.dependencies?.ws !== locked.version)
    throw new Error(
      'Dead End Dash relay expects another ws than the root lockfile records',
    );
  const sealed = seal(pin.serverDigest);

  const files = new Map([
    ['relay-core.mjs', Buffer.from(relay)],
    ...own.map((name) => [name, readFileSync(here('./server/' + name))]),
    [
      'package.json',
      Buffer.from(
        JSON.stringify(
          {
            private: true,
            type: 'module',
            engines: { node: '24.21.0' },
            dependencies: { ws: locked.version },
          },
          null,
          2,
        ) + '\n',
      ),
    ],
    ['Dockerfile', Buffer.from(dockerfile)],
  ]);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(new URL('node_modules/', out), { recursive: true });
  for (const [name, bytes] of files) writeFileSync(new URL(name, out), bytes);
  cpSync(here('../../node_modules/ws/'), new URL('node_modules/ws/', out), {
    recursive: true,
  });
  writeFileSync(
    new URL('runtime-evidence.json', out),
    JSON.stringify(
      {
        revision: pin.revision,
        sourceUrl: pin.sourceUrl,
        sourceDigest: sealed.digest,
        version: game.version,
        source: sealed.source,
        dependency: {
          name: 'ws',
          version: locked.version,
          resolved: locked.resolved,
          integrity: locked.integrity,
          license: locked.license,
        },
        approval:
          'Local evaluation only. No image was built and nothing was deployed; source rights and publication have not been reviewed',
        // Every file in the runtime, the copied package included.
        files: readdirSync(out, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) =>
            relative(
              fileURLToPath(out),
              join(entry.parentPath, entry.name),
            ).replaceAll(sep, '/'),
          )
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
    serverDigest: sealed.digest,
    version: game.version,
    files: [...files.keys(), 'runtime-evidence.json'].sort(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await buildDeadEndDashServer(process.argv[2]);
  console.log(
    'Prepared the Dead End Dash party relay runtime; no deployment performed.',
  );
}
