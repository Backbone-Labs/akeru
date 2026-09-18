import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
export function build(id) {
  if (!['supertux', 'supertuxkart'].includes(id)) throw Error('Unknown title');
  const inventory = JSON.parse(
    readFileSync(
      new URL(`compliance/source-inventories/${id}-browser.json`, root),
    ),
  );
  const input = new URL(
      `dist/tux-research/${id === 'supertux' ? 'supertux' : 'kart'}/`,
      root,
    ),
    out = new URL(`dist/${id}/`, root);
  const files = {};
  for (const f of inventory.files) {
    const bytes = readFileSync(new URL(f.path, input));
    if (hash(bytes) !== f.sha256)
      throw Error('Source digest mismatch: ' + f.path);
    files[f.path] = bytes;
  }
  if (id === 'supertux') {
    const source = files['supertux2.js'].toString(),
      anchor = 'FS.mount(IDBFS,{},"/home/web_user/.local/share/supertux2/");';
    if (!source.includes(anchor)) throw Error('Storage patch anchor moved');
    files['supertux2.js'] = Buffer.from(source.replace(anchor, ''));
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [path, bytes] of Object.entries(files))
    writeFileSync(new URL(path, out), bytes);
  for (const path of readdirSync(new URL(`packages/${id}/src/`, root)))
    writeFileSync(
      new URL(path, out),
      readFileSync(new URL(`packages/${id}/src/${path}`, root)),
    );
  for (const path of ['runtime.js', 'saves.js'])
    writeFileSync(
      new URL(path, out),
      readFileSync(new URL('packages/wasm-desktop-preview/' + path, root)),
    );
  for (const [name, path] of [
    ['host.js', 'packages/arcade-preview/host.js'],
    ['save-client.js', 'packages/contracts/src/save-client.js'],
  ])
    writeFileSync(new URL(name, out), readFileSync(new URL(path, root)));
  writeFileSync(
    new URL('build-record.json', out),
    JSON.stringify(
      {
        ...inventory,
        artifacts: readdirSync(out).map((path) => ({
          path,
          sha256: hash(readFileSync(new URL(path, out))),
        })),
      },
      null,
      2,
    ),
  );
  console.log('Built ' + id + ' local evaluation');
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
