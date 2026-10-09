/** Explicit creator checkout -> private deployment artifact. No deployment side effects. */
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { replaceRequired } from '../creator-preview/build.mjs';
const revision = 'd33b14759a29c30d48d039c4cdcbedb14817741e';
const source = process.argv[2];
if (!source) throw new Error('Supply the authorized creator checkout');
const git = (...args) => execFileSync('git', ['-C', resolve(source), ...args]);
if (
  git('rev-parse', 'HEAD').toString().trim() !== revision ||
  git('status', '--porcelain', '--untracked-files=no').length
)
  throw new Error('Expected clean pinned creator checkout');
const out = new URL('../../dist/mythic-kitchen-server/', import.meta.url);
rmSync(out, { force: true, recursive: true });
mkdirSync(new URL('server/', out), { recursive: true });
mkdirSync(new URL('shared/', out), { recursive: true });
const evidence = [];
const read = (path) => {
  const bytes = git('show', `${revision}:${path}`);
  evidence.push({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  return bytes.toString();
};
let code = read('server/index.js');
// The cloud runtime serves health and gameplay only: never expose source/browser files.
code = code.slice(
  code.indexOf(
    '// ============================================================================',
  ),
);
code =
  `import http from 'node:http';
import { parseOrigins, allowUpgrade, takeControlToken } from './policy.mjs';
const origins = parseOrigins(process.env.TITLE_ORIGINS);
const PORT = Number(process.env.PORT || 8080);
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(404); res.end('Not found'); }
});
` + code;
const begin = code.indexOf('async function loadSim()');
const end = code.indexOf('// ---- Tunables', begin);
if (begin < 0 || end < 0) throw new Error('Simulation source changed');
code =
  code.slice(0, begin) +
  "import { Simulation } from '../shared/sim.js';\nexport const usingSimStub = false;\n\n" +
  code.slice(end);
const patch = (from, to) => {
  code = replaceRequired(code, from, to);
};
patch(
  "randomBytes(3).toString('hex').slice(0, 4)",
  "randomBytes(8).toString('hex')",
);
patch(
  'function createRoom(ws, msg) {',
  "function createRoom(ws, msg) {\n  if (rooms.size >= 16) return sendError(ws, ERR.FULL, 'All kitchens are busy. Try again soon.');",
);
patch(
  'code: genRoomCode(), hostId:',
  'createdAt: Date.now(), code: genRoomCode(), hostId:',
);
patch(
  'if (!Number.isFinite(seq) || seq <= p.lastSeq)',
  'if (!Number.isSafeInteger(seq) || seq < 0 || seq <= p.lastSeq)',
);
patch(
  'p.lastSeq = seq;',
  'p.lastInputAt = performance.now();\n  p.lastSeq = seq;',
);
patch(
  '  if (!q.length) return;',
  '  if (!q.length) {\n    if (!p.lastInputAt || performance.now() - p.lastInputAt > 300) room.sim.setInput(p.id, { ...NEUTRAL_INPUT });\n    return;\n  }',
);
patch(
  "export const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });",
  `export const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  if (!allowUpgrade(req, origins, wss.clients.size)) { socket.end('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n'); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});`,
);
patch(
  '  ws.playerId = null;',
  '  ws.controlTokens = 12; ws.controlAt = performance.now();\n  ws.playerId = null;',
);
patch(
  '    const handler = HANDLERS[msg.t];',
  `    if (msg.t !== MSG.INPUT && !takeControlToken(ws, performance.now())) { ws.close(1008, 'Too many requests'); return; }
    const handler = Object.hasOwn(HANDLERS, msg.t) ? HANDLERS[msg.t] : null;`,
);
code = code.replaceAll(
  'if (ws.readyState !== WebSocket.OPEN) return;',
  'if (ws.readyState !== WebSocket.OPEN) return;\n  if (ws.bufferedAmount > 262144) { ws.terminate(); return; }',
);
patch(
  '  const now = Date.now();\n  for (const ws of wss.clients)',
  `  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.createdAt > 30 * 60 * 1000) {
      for (const player of room.players.values()) player.ws.close(1000, 'Room expired. Create a new kitchen.');
      stopLoop(room); rooms.delete(room.code);
    }
  }
  for (const ws of wss.clients)`,
);
patch(
  'export { app, server };',
  `export { server };
process.once('SIGTERM', () => {
  for (const ws of wss.clients) ws.close(1012, 'Server restarting. Create a new kitchen.');
  setTimeout(() => void shutdown().then(() => process.exit(0)), 1000).unref();
});`,
);
writeFileSync(new URL('server/index.js', out), code);
cpSync(
  new URL('./server/policy.mjs', import.meta.url),
  new URL('server/policy.mjs', out),
);
for (const path of git('ls-tree', '-r', '--name-only', revision)
  .toString()
  .split('\n')
  .filter((p) => /^shared\/.+\.js$/.test(p) && !p.includes('.test.'))) {
  writeFileSync(new URL(path, out), read(path));
}
const lock = JSON.parse(
  readFileSync(new URL('../../package-lock.json', import.meta.url)),
);
const ws = lock.packages['node_modules/ws'];
if (ws.version !== '8.22.0' || !ws.integrity)
  throw new Error('Unexpected websocket dependency');
cpSync(
  new URL('../../node_modules/ws/', import.meta.url),
  new URL('node_modules/ws/', out),
  { recursive: true },
);
writeFileSync(
  new URL('package.json', out),
  JSON.stringify({
    private: true,
    type: 'module',
    engines: { node: '24.21.0' },
    dependencies: { ws: ws.version },
  }),
);
writeFileSync(
  new URL('runtime-evidence.json', out),
  JSON.stringify({ revision, source: evidence, dependency: ws }, null, 2),
);
writeFileSync(
  new URL('Dockerfile', out),
  'FROM node:24.21.0-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nUSER node\nENV NODE_ENV=production PORT=8080\nEXPOSE 8080\nCMD ["node", "server/index.js"]\n',
);
console.log(
  'Prepared private Mythic Kitchen cloud runtime; no deployment performed.',
);
