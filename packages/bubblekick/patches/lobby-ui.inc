  showLobby() {
    const el = this._setScreen('lobby', `<div class="panel wide room-lobby"><header class="room-heading"><div><small>INVITE YOUR FRIENDS</small><h2 class="code">${esc(this.room?.code || '')}</h2></div><p>Enter this code in<br>Online → Join room</p></header><div class="teams"></div><div class="rows"></div><div class="row-btns"></div><div class="status" role="status"></div></div>`, {
      back: () => this._leaveOnline(), backdrop:'tiles', help:'Pick a team. The host starts when everyone is here.'
    });
    this._renderLobby(); this.nav.setScope(el);
  }

  _renderLobby() {
    const el = this.screen?.el;
    if (!el || !this.room) return;
    const host = this.room.host === this.net.id, s = this.room.settings;
    const focused = this.nav.current?.dataset.roomFocus;
    const mine = this.room.members.find(m => m.id === this.net.id);
    if (mine?.seats.length) mine.seats.forEach((seat, i) => { if(this.seats[i]) Object.assign(this.seats[i], seat); });
    const teams = el.querySelector('.teams'); teams.replaceChildren();
    for (let team=0; team<2; team++) {
      const slots = this.room.members.flatMap(m => m.seats.filter(s => s.team === team).map(s => ({m,s})));
      const section = document.createElement('section'); section.className = `team team-${team}`;
      section.innerHTML = `<h3>${TEAM_INFO[team].name}<small>${slots.length}/4 players</small></h3><ul>${slots.map(({m,s}) => `<li><strong>${esc(m.name)}${m.id===this.net.id?' <i>YOU</i>':''}</strong><span>${esc(CHARACTERS[s.char].name)}${m.id===this.room.host?' · HOST':''}</span></li>`).join('') || '<li class="empty">Waiting for players</li>'}</ul><p class="team-fill">${s.bots===false?'Empty spots stay empty':`${5-slots.length} bot${5-slots.length===1?'':'s'} fill the team`}</p>`;
      const selected = this.seats[0]?.team === team;
      const button = this._btn(selected ? 'YOUR TEAM' : 'JOIN '+TEAM_INFO[team].name, () => {
        if(!this.seats.length) return;
        // Local bindings stay on this device; only validated seat choices cross the network.
        const seats = this.seats.map((seat,i) => ({...seat, team:i===0?team:seat.team}));
        this.net.send({type:C.SEATS, seats});
      }, selected ? 'primary' : '');
      button.disabled = !selected && slots.length >= 4; button.dataset.roomFocus = 'team'+team;
      button.setAttribute('aria-pressed', String(selected)); section.append(button); teams.append(section);
    }
    const rows = el.querySelector('.rows'); rows.replaceChildren();
    if(this.seats[0]) rows.append(optionRow('YOUR CRITTER', CHARACTERS.map(c=>c.name), this.seats[0].char, i => {
      this.net.send({type:C.SEATS, seats:this.seats.map((seat,n)=>({...seat,char:n===0?i:seat.char}))});
    }));
    if(host) {
      rows.append(optionRow('FILL EMPTY SPOTS', ['BOTS','NO BOTS'], s.bots===false?1:0, i=>this.net.send({type:C.SETTINGS,...s,bots:i===0})),
        optionRow('MATCH LENGTH', MINUTES.map(m=>`${m} MIN`), Math.max(0, MINUTES.indexOf(s.minutes)), i=>this.net.send({type:C.SETTINGS,...s,minutes:MINUTES[i]})));
    } else { const info=document.createElement('p'); info.className='note'; info.textContent=`${s.minutes} min · ${s.bots===false?'No bots':'Bots fill empty spots'}`; rows.append(info); }
    if(s.bots===false) { const note=document.createElement('small'); note.className='note'; note.textContent='Players only, including open goals. Tied matches end in a draw.'; rows.append(note); }
    const btns = el.querySelector('.row-btns'); btns.replaceChildren();
    if(host) btns.append(this._btn('START MATCH', ()=>this.net.send({type:C.START}), 'primary'));
    else { const waiting=document.createElement('p'); waiting.className='note'; waiting.textContent='Waiting for the host to start…'; btns.append(waiting); }
    btns.append(this._btn('LEAVE ROOM', ()=>this._leaveOnline(), 'ghost'));
    [...rows.querySelectorAll('[data-focus]'),...btns.querySelectorAll('[data-focus]')].forEach((b,i)=>b.dataset.roomFocus='option'+i);
    this.nav.setScope(el);
    const next=[...el.querySelectorAll('[data-room-focus]')].find(b=>b.dataset.roomFocus===focused);
    if(next) this.nav.focus(next,true);
  }
