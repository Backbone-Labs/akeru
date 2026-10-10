// A stand-in for the Dead End Dash repository, with the same shape as the
// files the two recipes read. It lets every refusal, and the party server's
// own entry point, run in public CI, where the real source is absent.
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const fixtureUrl = 'https://github.com/fixture/dead-end-dash';
export const lockedWs = JSON.parse(
  readFileSync(new URL('../../package-lock.json', import.meta.url)),
).packages['node_modules/ws'].version;

export const run = (dir, ...args) =>
  execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      ...args,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
    .toString()
    .trim();

// Not the game's relay: the same exports, and it tells whoever connects what
// it was created with, so a test can see what the entry point passed in.
const relay = `import { WebSocketServer } from 'ws';
export const parseHops = (value) =>
  value === undefined || value === '' ? null : Number(value);
export const addressOptions = (hops) =>
  hops === null ? { probesPerMinute: 0, maxPerAddress: 0 } : { hops };
export function createRelay(options) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) =>
    ws.send(JSON.stringify({ fixture: 'relay', options })),
  );
  return {
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
      return true;
    },
    close(code, reason) {
      for (const ws of wss.clients) ws.close(code, reason);
      wss.close();
    },
  };
}
`;

/** A committed checkout in a temporary directory. `change(files, dir)` edits
 * the file table before the commit; `{ link }` as a value makes a symlink. */
export function fixture(change = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'akeru-ded-fixture-'));
  const files = {
    'package.json':
      JSON.stringify({ version: '9.9.9', dependencies: { ws: lockedWs } }) +
      '\n',
    'src/config.js': "export const VERSION = '9.9.9';\n",
    'src/game.js':
      "import css from './ui/styles.css';\n" +
      "import font from '../assets/fonts/pixelify-sans-latin-400-normal.woff2';\n" +
      "export class Game { constructor() { this.marker = 'fixture-game' + css + font; } }\n",
    'src/ui/styles.css': '.ded{color:red}\n',
    'assets/fonts/pixelify-sans-latin-400-normal.woff2': 'four',
    'assets/fonts/pixelify-sans-latin-700-normal.woff2': 'seven',
    'assets/fonts/OFL-Pixelify-Sans.txt': 'SIL Open Font License\n',
    'server/relay-core.mjs': relay,
  };
  change(files, dir);
  run(dir, 'init', '-q', '-b', 'main');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    if (content && typeof content === 'object')
      symlinkSync(content.link, join(dir, path));
    else writeFileSync(join(dir, path), content);
  }
  run(dir, 'add', '-A');
  run(dir, 'commit', '-q', '-m', 'fixture');
  run(dir, 'remote', 'add', 'origin', fixtureUrl + '.git');
  const out = mkdtempSync(join(tmpdir(), 'akeru-ded-out-'));
  return {
    dir,
    out,
    outUrl: pathToFileURL(out + '/'),
    pin: { sourceUrl: fixtureUrl, revision: run(dir, 'rev-parse', 'HEAD') },
    done() {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    },
  };
}
