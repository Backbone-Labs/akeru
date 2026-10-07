import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  source = process.argv[2],
  revision = process.env.BUBBLEKICK_REVISION;
if (!source || !/^[a-f0-9]{40}$/.test(revision || ''))
  throw Error('Source checkout and full BUBBLEKICK_REVISION required');
const git = (...args) => execFileSync('git', ['-C', source, ...args]);
if (
  git('rev-parse', 'HEAD').toString().trim() !== revision ||
  git('status', '--porcelain', '--untracked-files=no').length
)
  throw Error('Source must be clean and pinned');
const out = resolve(root, 'dist/bubblekick-server');
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'server'), { recursive: true });
for (const p of git('ls-tree', '-r', '--name-only', revision)
  .toString()
  .split('\n')
  .filter(
    (p) =>
      p.startsWith('shared/') && p.endsWith('.js') && !p.endsWith('.test.js'),
  )) {
  mkdirSync(dirname(resolve(out, p)), { recursive: true });
  writeFileSync(resolve(out, p), git('show', `${revision}:${p}`));
}
let code = git('show', `${revision}:server/net.js`).toString();
function patch(from, to) {
  if (!code.includes(from)) throw Error('Source changed: ' + from);
  code = code.replace(from, to);
}
patch(
  "import { WebSocketServer } from 'ws';",
  "import { WebSocketServer } from 'ws';\nimport {randomInt} from 'node:crypto';",
);
patch('Math.floor(Math.random() * A.length)', 'randomInt(A.length)');
patch(
  'if (ws.readyState === 1) ws.send(JSON.stringify(msg));',
  'if (ws.bufferedAmount>1024*1024) return ws.terminate();\n  if (ws.readyState === 1) ws.send(JSON.stringify(msg));',
);
patch(
  'for (const m of room.members.values()) if (m.ws.readyState === 1) m.ws.send(data);',
  'for (const m of room.members.values()) { if(m.ws.bufferedAmount>1024*1024)m.ws.terminate(); else if(m.ws.readyState===1)m.ws.send(data); }',
);
patch(
  'function handle(client, msg) {',
  `function handle(client, msg) {
 const now=Date.now();
 if(msg.type!=='in'&&msg.type!=='ping'){
  if(now-client.controlStamp>=10000){client.controlStamp=now;client.controlBudget=12;}
  if(--client.controlBudget<0)return send(client.ws,{type:S.ERROR,code:'rate',message:'Please wait before trying again.'});
 }
 if(!client.hello&&msg.type!==C.HELLO)return;
`,
);
patch(
  '      leave(client);\n      const room =',
  "      if(rooms.size>=32&&(!client.room||client.room.members.size>1))return send(client.ws,{type:S.ERROR,code:'capacity',message:'Server is full. Try again shortly.'});\n      leave(client);\n      const room =",
);
patch(
  '      if (room.world) return send',
  '      if (client.room===room)return send(client.ws,roomInfo(room));\n      if (room.world) return send',
);
patch(
  '      client.seats = seats;',
  "      const others=[...client.room.members.values()].filter(m=>m.id!==client.id).reduce((n,m)=>n+m.seats.length,0);\n      if(others+seats.length>MAX_HUMANS)return send(client.ws,{type:S.ERROR,code:'full',message:'All player seats are taken.'});\n      client.seats = seats;",
);
patch(
  'const wss = new WebSocketServer({ server, path, maxPayload: LIMITS.MAX_MSG_BYTES });',
  'const wss = new WebSocketServer({ noServer:true, perMessageDeflate:false, maxPayload: LIMITS.MAX_MSG_BYTES });',
);
patch(
  'stamp: Date.now() };',
  "stamp: Date.now(), controlStamp: Date.now(), controlBudget: 12 };\n    const handshake=setTimeout(()=>{if(!client.hello)ws.close(1008,'Handshake required');},10000);\n    handshake.unref();\n    ws.on('close',()=>clearTimeout(handshake));",
);
patch(
  'if (--client.budget < 0) return;',
  "if (--client.budget < 0) return ws.close(1008,'Rate limit');",
);
patch('  client.room = null;', '  client.room = null;\n  client.seats = [];');
patch(
  '      const ev = step(room.world, room.inputs);',
  `      for(const h of room.humanMap){const owner=room.members.get(h.owner);if(!owner||Date.now()-(owner.lastInputAt||0)>500)room.inputs[h.idx]={mx:0,mz:0,bits:0};}
      const ev = step(room.world, room.inputs);`,
);
patch(
  '      for (const inp of decodeInputs(msg)) {',
  '      client.lastInputAt=Date.now();\n      for (const inp of decodeInputs(msg)) {',
);
writeFileSync(resolve(out, 'server/net.js'), code);
for (const p of ['start.mjs', 'policy.mjs'])
  cpSync(
    resolve(root, 'packages/bubblekick/server', p),
    resolve(out, 'server', p),
  );
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'))),
  ws = lock.packages['node_modules/ws'];
if (ws.version !== '8.22.0' || !ws.integrity)
  throw Error('Unexpected ws lock entry');
cpSync(resolve(root, 'node_modules/ws'), resolve(out, 'node_modules/ws'), {
  recursive: true,
});
writeFileSync(
  resolve(out, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    engines: { node: '24.19.0' },
    dependencies: { ws: ws.version },
  }),
);
writeFileSync(
  resolve(out, 'Dockerfile'),
  'FROM node:24.19.0-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nUSER node\nENV NODE_ENV=production PORT=8080\nEXPOSE 8080\nCMD ["node", "server/start.mjs"]\n',
);
console.log(
  'Prepared Bubble Kick server in ' + out + '; no deployment performed.',
);
