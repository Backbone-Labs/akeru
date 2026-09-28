import { build } from 'esbuild';
await build({
  entryPoints: [
    new URL('../old-san-juan-kart/multiplayer/browser.js', import.meta.url)
      .pathname,
  ],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: new URL('../../dist/multiplayer/browser.js', import.meta.url)
    .pathname,
});
