/** Local-only browser fixture: three distinct loopback origins, no production changes. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { planLaunch } from './reference-host.js';

export async function startBrowserConformance() {
  const source = async (path) =>
    readFile(new URL(path, import.meta.url), 'utf8');
  const [titleScript, shellScript, sessionScript, adapterScript, manifestText] =
    await Promise.all([
      source('../../../examples/browser-conformance/title.js'),
      source('../../../examples/browser-conformance/shell.js'),
      source('./reference-session.js'),
      source('../../../examples/reference-adapter/adapter.js'),
      source('../../../examples/contract-fixture/akeru.json'),
    ]);
  const servers = [];
  const serve = async (handler) => {
    const server = createServer(handler);
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close = () =>
    Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          }),
      ),
    );
  try {
    let requests = 0,
      config;
    const collector = await serve((req, res) => {
      requests++;
      res.end('forbidden');
    });
    const shell = await serve((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.url === '/shell.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(shellScript);
      }
      if (req.url === '/collector-count') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ count: requests }));
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<!doctype html><title>Akeru browser conformance</title><pre id="result">pending</pre><script id="config" type="application/json">${JSON.stringify(config)}</script>${config.titles.map((t) => `<iframe id="${t.name}" sandbox="allow-scripts allow-same-origin" src="${t.origin}/#${new URLSearchParams({ shell, collector, nonce: t.nonce, name: t.name })}"></iframe>`).join('')}<script src="/shell.js"></script>`,
      );
    });
    const policy = planLaunch(JSON.parse(manifestText), {
      grants: ['save.local'],
      graphics: ['webgl2'],
      features: [],
      shellOrigin: 'https://shell.example.com',
      titleOrigin: 'https://title.example.net',
    });
    const titles = [];
    for (const name of ['a', 'b']) {
      const origin = await serve((req, res) => {
        // Only this loopback test replaces the HTTPS ancestor with its ephemeral shell.
        for (const [key, value] of Object.entries(policy.headers))
          res.setHeader(key, value.replace('https://shell.example.com', shell));
        res.setHeader('Cache-Control', 'no-store');
        const request = new URL(req.url, 'http://fixture.invalid');
        if (req.method !== 'GET') {
          res.statusCode = 405;
          return res.end('method denied');
        }
        if (request.search) {
          res.statusCode = 404;
          return res.end('undeclared artifact');
        }
        const scripts = {
          '/title.js': titleScript,
          '/session.js': sessionScript,
          '/adapter.js': adapterScript,
        };
        if (scripts[request.pathname]) {
          res.setHeader('Content-Type', 'text/javascript');
          return res.end(scripts[request.pathname]);
        }
        if (request.pathname === '/module.wasm') {
          res.setHeader('Content-Type', 'application/wasm');
          return res.end(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
        }
        if (request.pathname !== '/') {
          res.statusCode = 404;
          return res.end('undeclared artifact');
        }
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<!doctype html><title>Original isolated title fixture</title><script type="module" src="/title.js"></script>',
        );
      });
      titles.push({ name, origin, nonce: randomUUID() });
    }
    config = { titles };
    return { url: shell, close };
  } catch (error) {
    await close();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const fixture = await startBrowserConformance();
  console.log(`Open browser conformance: ${fixture.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await fixture.close();
      process.exit(0);
    });
}
