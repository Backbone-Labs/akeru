import { readFileSync } from 'node:fs';
const file = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
export function patchBubblekick(path, source) {
  let code = source;
  const replace = (from, to) => {
    if (!code.includes(from))
      throw Error(`Bubblekick patch mismatch in ${path}: ${from.slice(0, 70)}`);
    code = code.replace(from, to);
  };
  if (path === 'client/game/app.js') {
    const begin = code.indexOf('  showOnline(error'),
      end = code.indexOf('  async _ensureNet', begin);
    code =
      code.slice(0, begin) + file('online-ui.inc') + '\n' + code.slice(end);
    const lobby = code.indexOf('  showLobby()'),
      after = code.indexOf('  _backToRoom()', lobby);
    code =
      code.slice(0, lobby) + file('lobby-ui.inc') + '\n' + code.slice(after);
    replace(
      'this.showSetup({ online: true, join: this._menuDevice() });',
      `this.setupOnline = true;
          this._join(this._menuDevice());
          const counts=[0,0]; msg.members.forEach(m=>m.seats.forEach(s=>counts[s.team]++));
          this.seats.forEach(s=>{s.team=counts[0]<=counts[1]?0:1;s.ready=true;});
          this.showLobby();
          this.net.send({type:C.SEATS,seats:this.seats});`,
    );
    replace(
      "if (this.screen?.name === 'online') {",
      "if (['online','lobby'].includes(this.screen?.name)) {",
    );
    replace(
      '    const d = devId && this.input.get(devId);',
      `    if(s.online && this.seats.length===1) {
      const active=this.input.list().filter(d=>d.connected).sort((a,b)=>b.lastActive-a.lastActive)[0];
      if(active && active.lastActive>0) {devId=active.id;this.seats[0].dev=devId;}
    }
    const d = devId && this.input.get(devId);`,
    );
    replace(
      '    this.showSetup({ online: true });\n  }\n\n  _leaveOnline',
      '    this.showLobby();\n  }\n\n  _leaveOnline',
    );
  }
  if (path === 'shared/protocol.js') {
    replace('SNAP_EVERY = 3', 'SNAP_EVERY = 2');
    replace(
      '    penalties: s.penalties !== false,',
      '    bots: s.bots !== false,\n    penalties: s.bots !== false && s.penalties !== false,',
    );
    replace(
      '    e: events,',
      '    e: events,\n    movement: world.players.map(p=>[p.st,p.kickCd,p.tackleCd]),\n    prev: world.humans.map(h=>h.prev),',
    );
  }
  if (path === 'shared/sim/world.js') {
    replace(
      '  resetKickoff(world, 0);',
      `  for(const p of world.players) p.active = settings.bots !== false || p.human >= 0;
  if(settings.bots === false) settings.penalties = false;
  resetKickoff(world, 0);`,
    );
    code = code.replaceAll(
      'for (const p of world.players) {',
      'for (const p of world.players) {\n    if(p.active === false) continue;',
    );
    replace(
      'function integratePlayer(world, p, dt) {',
      'function integratePlayer(world, p, dt) {\n  if(p.active === false) return;',
    );
    replace(
      '  const ps = world.players;',
      '  const ps = world.players.filter(p=>p.active !== false);',
    );
    replace(
      '    teamPlan(world);',
      '    if(world.settings.bots !== false) teamPlan(world);',
    );
    replace(
      '    if (p.gk) thinkKeeper',
      '    if(world.settings.bots === false) {p.mx=p.mz=0;continue;}\n    if (p.gk) thinkKeeper',
    );
    // Shared movement/action integrator. Contacts, goals and scoring stay authoritative.
    code += `\nexport function predictLocal(world, inputs, dt) {
      world.events=[];
      for(const [idx,input] of inputs) {
        const h=world.humans[idx]; if(!h) continue;
        applyHuman(world,h,input,dt,world.phase==='play');
        const p=world.players[h.player];
        if(world.phase!=='play') p.mx=p.mz=0;
        integratePlayer(world,p,dt);
      }
    }\n`;
  }
  if (path === 'shared/sim/actions.js') {
    // Stronger taps and charged shots, without increasing lift or changing aim assist.
    replace(
      '  const sp = (13 + 19 * charge) * p.pow;',
      '  const sp = (32 + 32 * charge) * p.pow;',
    );
    code += '\n' + file('pass-flight.mjs');
    replace(
      '  const speed = Math.max(11, Math.min(26, dist0 * 1.3 + 8)) * (lob ? 0.78 : 1);\n  const lead = (dist0 / speed) * 0.85;',
      `  const tuning = {lob,groundFriction:BALL.groundFriction,airDrag:BALL.airDrag,gravity:BALL.gravity};
  const lead = passFlight({...tuning,distance:Math.max(0,dist0-DRIBBLE_DIST)}).duration * 1.12;`,
    );
    replace(
      '  b.vx = dx * speed;\n  b.vz = dz * speed;\n  b.vy = lob ? 7.5 : 0;',
      `  const flight=passFlight({...tuning,distance:Math.max(0,Math.hypot(tx-p.x,tz-p.z)-DRIBBLE_DIST)});
  b.y = BALL.radius;
  b.vx = dx * flight.speed;
  b.vz = dz * flight.speed;
  b.vy = flight.verticalSpeed;`,
    );

    replace(
      'return world.players.slice(team * 5, team * 5 + 5);',
      'return world.players.slice(team * 5, team * 5 + 5).filter(p=>p.active !== false);',
    );
    replace(
      'if (!to || to.human >= 0',
      'if (!to || to.active === false || to.human >= 0',
    );
  }
  if (path === 'client/render/renderer.js') {
    code = "import {followCamera} from '../framing.js';\n" + code;
    replace(
      '    if (this.debugCam) {',
      "    if (!state || this.mode === 'attract') this.followingMatch=false;\n    if (this.debugCam) {",
    );
    replace(
      'const v = this.players[i], p = state.players[i];',
      'const v = this.players[i], p = state.players[i];\n      v.root.visible=p.active !== false;\n      if(p.active === false) continue;',
    );
    // Follow the local player, keeping the surrounding action and nearby stands in frame.
    const start = code.indexOf('      const b = state.ball;\n      let fx'),
      end = code.indexOf('\n    }\n    const k =', start);
    if (start < 0 || end < 0) throw Error('Camera patch mismatch');
    code =
      code.slice(0, start) +
      `      const framing=followCamera(state,this.localHumans,aspect);
      px=framing.x; py=framing.height; pz=framing.z+framing.depth;
      lx=framing.x; ly=0; lz=framing.z;
      rate=5;
      // Set the first frame directly; smooth subsequent movement and player switches.
      if(!this.followingMatch) {this.camPos.set(px,py,pz);this.camLook.set(lx,ly,lz);}
      this.followingMatch=true;` +
      code.slice(end);
  }
  if (path === 'client/game/sessions.js') {
    replace('createWorld, step }', 'createWorld, step, predictLocal }');
    replace(
      '    this.seq = 0;',
      '    this.seq = 0;\n    this.unacked = [];\n    this.predictionReady = false;',
    );
    replace(
      '      st.ballOwner = st.ball.owner;',
      `      st.ballOwner = st.ball.owner;
      // Rebase to the authoritative checkpoint, then replay only unacknowledged inputs.
      if(Number.isInteger(msg.ack)) {
        this.unacked=this.unacked.filter(frame=>frame.seq>msg.ack).slice(-30);
        this.world.phase=st.phase; Object.assign(this.world.ball,st.ball);
        st.players.forEach((p,i)=>Object.assign(this.world.players[i],p,{
          st:msg.movement?.[i]?.[0]||0,kickCd:msg.movement?.[i]?.[1]||0,tackleCd:msg.movement?.[i]?.[2]||0
        }));
        st.humans.forEach((h,i)=>Object.assign(this.world.humans[i],h,{prev:msg.prev?.[i]||0}));
        for(const frame of this.unacked) predictLocal(this.world,frame.inputs,DT);
        this.predictionReady=true;
      }`,
    );
    const start = code.indexOf('    // inputs at ~60 Hz'),
      end = code.indexOf('    const snaps = this.snaps;', start);
    code =
      code.slice(0, start) +
      `    // Fixed-rate sampling preserves taps while avoiding a burst after a background hitch.
    this.sendAcc=Math.min(this.sendAcc+dt,DT*4);
    while(this.sendAcc >= DT) {
      this.sendAcc-=DT;
      const entries=[], inputs=[];
      this.you.forEach((hIdx,local)=>{
        if(hIdx<0) return;
        const s=this.paused?{mx:0,mz:0,bits:0}:sample(hIdx);
        const entry=encodeInput(local,s.mx,s.mz,s.bits);
        entries.push(entry); inputs.push([hIdx,{mx:entry[1]/127,mz:entry[2]/127,bits:entry[3]}]);
      });
      if(entries.length) {
        const seq=this.seq++;
        this.net.send({type:C.INPUT,s:seq,i:entries});
        this.unacked.push({seq,inputs}); if(this.unacked.length>30)this.unacked.shift();
        if(this.predictionReady && this.unacked.length<30) predictLocal(this.world,inputs,DT);
      }
    }
` +
      code.slice(end);
    replace('const delay = SNAP_EVERY * 2 + 2;', 'const delay = SNAP_EVERY;');
    replace(
      '    const ev = this.pending;',
      `    if(this.predictionReady && this.unacked.length<30 && this.world.phase==='play') {
      for(const idx of this.you) {
        const h=this.world.humans[idx]; if(!h)continue;
        const p=this.world.players[h.player], v=this.view.players[h.player];
        Object.assign(v,{x:p.x,z:p.z,vx:p.vx,vz:p.vz,fx:p.fx,fz:p.fz,state:p.state,charge:p.charge});
        this.view.humans[idx].player=h.player;
      }
    }
    const ev = this.pending;`,
    );
  }
  return code;
}

export function patchOnlineServer(code) {
  const replace = (from, to) => {
    if (!code.includes(from)) throw Error('Server patch mismatch: ' + from);
    code = code.replace(from, to);
  };
  replace(
    '      client.seats = seats;',
    `      const all=[...client.room.members.values()].filter(m=>m.id!==client.id).flatMap(m=>m.seats).concat(seats);
      if([0,1].some(team=>all.filter(s=>s.team===team).length>4))return send(client.ws,{type:S.ERROR,code:'team_full',message:'That team is full. Choose the other team.'});
      client.seats = seats;`,
  );
  replace(
    '        broadcast(room, packSnapshot(room.world, room.events));',
    `        const snapshot=packSnapshot(room.world,room.events);
        for(const member of room.members.values()) send(member.ws,{...snapshot,ack:member.inputSeq??-1});`,
  );
  replace(
    '      for (const inp of decodeInputs(msg)) {',
    `      if(!Number.isSafeInteger(msg.s)||msg.s<0||msg.s<=(client.inputSeq??-1))return;
      client.inputSeq=msg.s;
      for (const inp of decodeInputs(msg)) {`,
  );
  replace(
    '    const you = m.seats.map',
    '    m.inputSeq=-1;\n    const you = m.seats.map',
  );
  replace(
    '      return startMatch(room);',
    `      if([...room.members.values()].some(m=>!m.seats.length))return send(client.ws,{type:S.ERROR,code:'waiting',message:'Wait for everyone to choose a team.'});
      const teams=[0,1].map(t=>[...room.members.values()].flatMap(m=>m.seats).filter(s=>s.team===t).length);
      if(room.settings.bots===false && teams.some(n=>n===0))return send(client.ws,{type:S.ERROR,code:'teams',message:'No bots: add at least one player to each team.'});
      return startMatch(room);`,
  );
  return code;
}
