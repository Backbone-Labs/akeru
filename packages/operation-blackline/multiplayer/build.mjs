/** Derive match logic and operator physics from hash-verified pinned sources. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from '../../arcade-preview/build.mjs';
import { verifySource } from '../../puzzle-preview/build.mjs';
const inventory = JSON.parse(
  readFileSync(
    resolve(root, 'compliance/source-inventories/operation-blackline.json'),
  ),
);
const out = resolve(root, 'dist/blackline-server');
mkdirSync(out, { recursive: true });
function read(path) {
  const bytes = execFileSync('git', [
    '-C',
    resolve(root, 'dist/external/operation-blackline'),
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
const source = read('server/server.js');
const weapons = source.slice(
  source.indexOf('const WEAPONS ='),
  source.indexOf('const TICK_MS ='),
);
const a = source.indexOf('/* ---------- geometry helpers'),
  b = source.indexOf('/* ---------- networking');
if (a < 0 || b < a) throw Error('Blackline match anchors changed');
let core = source.slice(a, b).replaceAll('Date.now()', 'clockMs');
const evStart = core.indexOf('function broadcastEv('),
  evEnd = core.indexOf('function teamCount(', evStart);
core =
  core.slice(0, evStart) +
  'function pushEv(ev) { events.push(ev); }\n' +
  core.slice(evEnd);
core = core.replace('  setTimeout(resetMatch, 12000);', '');
// Spawn tuples are [x,z,yaw], not XYZ. This fixes the upstream distance metric.
core = core.replace('s[2] - o.p[2]', 's[1] - o.p[2]');
put(
  'match.js',
  `import MAP from './map-spec.json' with { type: 'json' };\nexport { MAP };\nexport function createMatch(CFG) {\nlet clockMs = 0; const events = [];\n${weapons}\n${core}\nreturn { ents, events, CFG, makeEnt, respawn, balanceBots, hitscan, eyeOf, pushEv,
  get phase() { return phase; }, get scores() { return scores; }, get timeLeft() { return timeLeft; }, get now() { return clockMs; },
  step(dt) { clockMs += dt * 1000; if (phase !== 'play') return; timeLeft -= dt * 1000;
    if (timeLeft <= 0) { endMatch(scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1); return; }
    for (const e of ents.values()) { if (!e.human) botThink(e, dt, clockMs); if (!e.alive && clockMs >= e.respawnAt && e.respawnAt > 0 && phase === 'play') respawn(e); if (e.alive && e.hp < 100 && clockMs - e.lastDmg > 4500) e.hp = Math.min(100, e.hp + dt * 40); }
  }
}; }\n`,
);
let player = read('public/js/player.js');
player = player
  .replace("import * as THREE from 'three';", '')
  .replace('export default Player;', 'return Player;');
put(
  'player.js',
  `import * as THREE from 'three-blackline';\nexport function createPlayer(Game) {\n${player}\n}\n`,
);
put('map-spec.json', read('shared/map-spec.json'));
put('UPSTREAM-LICENSE.txt', read('LICENSE'));
console.log('Built pinned Blackline match and operator physics');
