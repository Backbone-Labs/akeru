import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
await build({
  entryPoints: [new URL('./src/catalog-browser.js', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  plugins: [
    {
      name: 'colyseus-browser-websocket',
      setup(builder) {
        builder.onLoad(
          {
            filter:
              /[/\\]@colyseus[/\\]sdk[/\\]build[/\\]transport[/\\]WebSocketTransport\.mjs$/,
          },
          async ({ path }) => {
            const source = await readFile(path, 'utf8');
            // The pinned SDK probes Node's constructor before falling back to the
            // browser overload. WebKit reports that caught error as a page failure.
            const probe =
              / {8}try \{[\s\S]*?this\.ws = new WebSocket\(url, this\.protocols\);\n {8}\}/;
            if (!probe.test(source))
              throw Error('Colyseus browser transport changed');
            return {
              contents: source.replace(
                probe,
                '        this.ws = new WebSocket(url, this.protocols);',
              ),
              loader: 'js',
            };
          },
        );
      },
    },
  ],
  outfile: new URL('../../dist/multiplayer/browser.js', import.meta.url)
    .pathname,
});
