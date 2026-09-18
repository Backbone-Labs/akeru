/** Local-only original UI/runtime fixture. Never included by production packaging. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { createContainedFileReader } from '../../scripts/read-contained-file.mjs';
import { validateManifest } from '../../packages/contracts/src/index.js';
const root = new URL('../../', import.meta.url),
  read = (p) => readFileSync(new URL(p, root));
const hash = (b) => createHash('sha256').update(b).digest('hex');
export async function startCatalogDemo(options = {}) {
  const { controllerModelPath = process.env.AKERU_CONTROLLER_MODEL } = options;
  const controllerModel = controllerModelPath
    ? createContainedFileReader(dirname(controllerModelPath)).read(
        basename(controllerModelPath),
      )
    : null;
  const servers = [];
  let state = 'available',
    shellOrigin;
  const serve = async (handler) => {
    const server = createServer(handler);
    servers.push(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const entries = [];
  const previewImages = {};
  let titleOrigin;
  for (const titleOptions of options.titles ?? [options]) {
    const titleFiles =
      titleOptions.titleFiles ??
      Object.fromEntries(
        ['title.html', 'title.js', 'title.css'].map((p) => [
          p,
          read(`examples/catalog-demo/${p}`),
        ]),
      );
    titleFiles['save-client.js'] = read(
      'packages/contracts/src/save-client.js',
    );
    const digest = hash(
      Buffer.from(
        JSON.stringify(
          Object.entries(titleFiles).map(([path, b]) => ({
            path,
            sha256: hash(b),
          })),
        ),
      ),
    );
    titleOrigin = await serve((req, res) => {
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'self' ${titleOptions.wasm ? "'wasm-unsafe-eval'" : ''}; style-src 'self'; img-src 'self'; media-src 'self'; connect-src ${titleOptions.wasm || titleOptions.assetRequests ? "'self'" : "'none'"}; frame-ancestors ${shellOrigin}; base-uri 'none'; form-action 'none'; object-src 'none'`,
      );
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
      );
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      const path = req.url?.slice(`/releases/${digest}/`.length);
      if (
        req.method !== 'GET' ||
        !req.url.startsWith(`/releases/${digest}/`) ||
        !Object.hasOwn(titleFiles, path)
      ) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.setHeader(
        'Content-Type',
        path.endsWith('.png')
          ? 'image/png'
          : path.endsWith('.jpg')
            ? 'image/jpeg'
            : path.endsWith('.ogg')
              ? 'audio/ogg'
              : path.endsWith('.txt')
                ? 'text/plain'
                : path.endsWith('.wasm')
                  ? 'application/wasm'
                  : path.endsWith('.json')
                    ? 'application/json'
                    : path.endsWith('.html')
                      ? 'text/html'
                      : path.endsWith('.js')
                        ? 'text/javascript'
                        : 'text/css',
      );
      res.end(titleFiles[path]);
    });
    const manifest = titleOptions.manifest
      ? {
          ...titleOptions.manifest,
          artifacts: Object.entries(titleFiles).map(([path, bytes]) => ({
            path,
            sha256: hash(bytes),
          })),
        }
      : {
          specVersion: '0.1.0',
          id: 'orbit-study',
          version: '0.1.0',
          sdk: { range: '^0.1.0' },
          title: 'Orbit study',
          entry: 'title.html',
          artifacts: Object.entries(titleFiles).map(([path, bytes]) => ({
            path,
            sha256: hash(bytes),
          })),
          provenance: {
            source: {
              url: 'https://github.com/Backbone-Labs/akeru',
              revision: execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd: new URL('../../', import.meta.url),
                encoding: 'utf8',
              }).trim(),
              license: 'MIT',
              rightsStatus: 'unknown',
            },
            assets: Object.keys(titleFiles).map((path) => ({
              path,
              kind: 'original',
              license: 'MIT',
              evidence: ['https://github.com/Backbone-Labs/akeru'],
            })),
          },
          input: { controller: true, touch: true },
          runtime: {
            graphics: { preferred: 'dom', fallback: null },
            requiredFeatures: [],
            optionalFeatures: [],
          },
          capabilities: ['save.local'],
          saves: {
            schemaVersion: 1,
            guestLocal: true,
            accountSync: 'disabled',
          },
        };
    const validation = validateManifest(manifest);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const entry = {
      manifest,
      release: { digest, origin: titleOrigin },
      metadata: titleOptions.metadata ?? {
        summary:
          'Move a little light. Find a little space. An original input study.',
        description:
          'A quiet, original fixture for trying Akeru’s catalog, isolated runtime and controls. Move the light around its orbit with a controller or the on-screen touch controls. This is a design and conformance preview, not a published game.',
        category: 'sandbox',
        creator: 'Akeru',
        ageLabel: 'Original abstract test fixture',
        controls: {
          controller: [
            'Left stick or directional pad — move the light.',
            'Use Pause and Exit in the shell to manage your session.',
          ],
          touch: [
            'Use the directional touch controls below the runtime.',
            'Controls lets you inspect and adjust input settings.',
          ],
        },
        privacy: [
          'No external requests, accounts, advertising or upstream trackers.',
          'Position is saved locally in this browser. Account linking and cloud sync are not connected.',
        ],
        notices: [
          {
            label: 'Original fixture source and MIT notice ↗',
            url: 'https://github.com/Backbone-Labs/akeru',
          },
        ],
      },
      availability: 'available',
    };
    if (titleOptions.previewImage) {
      entry.metadata = {
        ...entry.metadata,
        cover: `/previews/${manifest.id}.png`,
      };
      previewImages[entry.metadata.cover] = titleOptions.previewImage;
    }
    entries.push(entry);
  }
  shellOrigin = await serve((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET') {
      res.writeHead(405);
      return res.end();
    }
    if (Object.hasOwn(previewImages, req.url)) {
      res.setHeader('Content-Type', 'image/png');
      return res.end(previewImages[req.url]);
    }
    if (req.url === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (req.url === '/catalog.json') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          schemaVersion: '0.1.0',
          mode: 'demo',
          entries:
            state === 'unpublished'
              ? []
              : entries.map((entry) => ({ ...entry, availability: state })),
        }),
      );
    }
    if (req.url === '/local-controller.glb' && controllerModelPath) {
      res.setHeader('Content-Type', 'model/gltf-binary');
      return res.end(controllerModel);
    }
    const vendor = {
      '/vendor/three/RoomEnvironment.js':
        'node_modules/three/examples/jsm/environments/RoomEnvironment.js',
      '/vendor/three/meshopt_decoder.module.js':
        'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js',
      '/vendor/three/three.module.js':
        'node_modules/three/build/three.module.js',
      '/vendor/three/three.core.js': 'node_modules/three/build/three.core.js',
      '/vendor/three/GLTFLoader.js':
        'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
      '/vendor/three/BufferGeometryUtils.js':
        'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
    };
    if (controllerModelPath && Object.hasOwn(vendor, req.url)) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(
        read(vendor[req.url])
          .toString()
          .replaceAll("from 'three'", "from '/vendor/three/three.module.js'")
          .replaceAll(
            "'../utils/BufferGeometryUtils.js'",
            "'/vendor/three/BufferGeometryUtils.js'",
          ),
      );
    }
    if (req.url === '/bootstrap.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(
        "import {mountCatalog} from '/app.js';import {createBrowserInputProvider} from '/input/browser.js';window.catalogPreview=mountCatalog({mode:'demo',inputProviderFactory:createBrowserInputProvider,controllerModelUrl:" +
          JSON.stringify(controllerModelPath ? '/local-controller.glb' : null) +
          '});',
      );
    }
    const file =
      ['/', '/games', '/settings'].includes(req.url) ||
      /^\/(?:g|play)\/[a-z0-9-]+\/?$/.test(req.url)
        ? 'platform/catalog/index.html'
        : /^\/(?:favicon\.svg|style\.css|app\.js|home\.js|onboarding\.js|controller-model\.js|model\.js|channel\.js|save-channel\.js|rumble\.js)$/.test(
              req.url,
            )
          ? `platform/catalog${req.url}`
          : req.url === '/saves/index.js'
            ? 'packages/saves/src/index.js'
            : /^\/input\/(?:browser|index|normalize|preferences|overlay)\.js$/.test(
                  req.url,
                ) || req.url === '/input/styles.css'
              ? `packages/input/src/${req.url.split('/').at(-1)}`
              : null;
    if (!file) {
      res.writeHead(404);
      return res.end('Not found');
    }
    try {
      res.setHeader(
        'Content-Type',
        file.endsWith('.svg')
          ? 'image/svg+xml'
          : file.endsWith('.html')
            ? 'text/html'
            : file.endsWith('.css')
              ? 'text/css'
              : 'text/javascript',
      );
      const bytes = read(file);
      res.end(
        file.endsWith('index.html') && req.url.startsWith('/play/')
          ? bytes
              .toString()
              .replace('<body>', '<body class="direct-player">')
              .replace('Opening Akeru…', 'Opening game…')
          : bytes,
      );
    } catch {
      res.writeHead(404);
      res.end('Asset unavailable');
    }
  });
  return {
    url: shellOrigin,
    titleOrigin,
    setAvailability(next) {
      if (!['available', 'paused', 'unpublished'].includes(next))
        throw new Error('Invalid fixture state');
      state = next;
    },
    close: () =>
      Promise.all(
        servers.map(
          (s) =>
            new Promise((r) => {
              s.closeAllConnections();
              s.close(r);
            }),
        ),
      ),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const demo = await startCatalogDemo();
  console.log(demo.url);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await demo.close();
      process.exit(0);
    });
}
