/** Explicit container context from the repository's pinned installed dependency. */
import {
  readFileSync,
  rmSync,
  mkdirSync,
  cpSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
const root = new URL('../../../', import.meta.url),
  out = new URL('dist/brawler-relay/', root);
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root)));
const version = JSON.parse(
  readFileSync(new URL('node_modules/ws/package.json', root)),
).version;
if (version !== lock.packages['node_modules/ws'].version)
  throw Error('Run npm ci with the root lockfile first');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(new URL('node_modules/ws', root), new URL('node_modules/ws', out), {
  recursive: true,
});
mkdirSync(new URL('server', out));
for (const file of ['main.mjs', 'relay.mjs'])
  copyFileSync(new URL(file, import.meta.url), new URL('server/' + file, out));
copyFileSync(
  new URL('Dockerfile', import.meta.url),
  new URL('Dockerfile', out),
);
writeFileSync(new URL('.gcloudignore', out), '.git\n.env\n');
console.log(out.pathname);
