/** Derive headless physics from hash-verified, pinned sources; never vendor game code. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from '../../arcade-preview/build.mjs';
import { headlessKart } from '../physics-source.mjs';
import { verifySource } from '../../puzzle-preview/build.mjs';
const inventory = JSON.parse(
  readFileSync(
    resolve(root, 'compliance/source-inventories/old-san-juan-kart.json'),
  ),
);
const out = resolve(root, 'dist/kart-server');
mkdirSync(out, { recursive: true });
function read(path) {
  const bytes = execFileSync('git', [
    '-C',
    resolve(root, 'dist/external/old-san-juan-kart'),
    'show',
    `${inventory.revision}:${path}`,
  ]);
  verifySource(
    bytes,
    inventory.files.find((f) => f.path === path),
  );
  return bytes.toString();
}
function put(name, text) {
  writeFileSync(resolve(out, name), text);
}
let track = read('src/world/track.js');
track = track
  .replace(/^import .*BufferGeometryUtils.*\n/m, '')
  .replace(/^import .*textures.*\n/m, '');
const start = track.indexOf('    this.group = new THREE.Group();');
const end = track.indexOf('    this._buildCheckpoints();', start);
if (start < 0 || end < 0) throw Error('Track build anchor changed');
track = track.slice(0, start) + track.slice(end);
put('track.js', track);
put('kart.js', headlessKart(read('src/kart/kart.js')));
put('courses.js', read('src/world/courses.js'));
put('race.js', read('src/race/race.js'));
const model = read('src/kart/model.js');
const characters = model.match(/export const CHARACTERS = \[[\s\S]*?\n\];/);
if (!characters) throw Error('Character data changed');
put('characters.js', characters[0]);
put('ai.js', read('src/ai/ai.js'));
put('UPSTREAM-LICENSE.txt', read('LICENSE'));
console.log('Built pinned Kart server physics');
