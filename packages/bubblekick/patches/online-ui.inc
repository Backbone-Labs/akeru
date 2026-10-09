  showOnline(error = '') {
    this.session?.dispose(); this.session = null; this.hud.show(false);
    if (!this.demo) this._startDemo();
    this.renderer.mode = 'attract';
    const st = this.save.data.settings;
    if (!st.name) st.name = `Roller${Math.floor(1000 + Math.random() * 9000)}`;
    const el = this._setScreen('online', `<div class="ribbon"><span>PLAY TOGETHER</span></div>
      <div class="panel room-entry"><label class="field"><span>YOUR NAME</span><input data-focus class="in-name" maxlength="16" autocomplete="nickname" value="${esc(st.name)}"></label>
      <div class="room-actions"><section><h2>Start a match</h2><p>Your room. Your teams.</p><div class="create-action"></div></section>
      <section><h2>Have a code?</h2><label class="field"><span>ROOM CODE</span><input data-focus class="in-code" aria-label="Room code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(this.lastCode || '')}"></label><div class="join-action"></div></section></div>
      <div class="status ${error ? 'warn' : ''}" role="status">${esc(error || 'Share a code. Pick a team. Kick off.')}</div><div class="back-action"></div></div>`,
      { back: () => { this._leaveOnline(true); this.showMain(); }, backdrop: 'tiles', help: 'Use your keyboard or tap the code to type.' });
    const code = el.querySelector('.in-code'), name = el.querySelector('.in-name'), status = el.querySelector('.status');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); this.lastCode = code.value; });
    let busy = false;
    const go = async (action) => {
      if (busy) return;
      if (action === 'join' && !/^[A-Z]{4}$/.test(code.value)) { status.textContent = 'Enter the four-letter room code.'; code.focus(); return; }
      busy = true; status.textContent = 'Connecting…';
      el.querySelectorAll('button').forEach(b => b.disabled = true);
      st.name = name.value.trim().slice(0, 16) || st.name; this.save.save();
      try {
        await this._ensureNet(defaultServerUrl(), st.name);
        this.net.send(action === 'create' ? {type:C.CREATE} : {type:C.JOIN, code:code.value});
      } catch (e) { status.textContent = e.message || 'Could not connect. Try again.'; }
      finally { busy = false; el.querySelectorAll('button').forEach(b => b.disabled = false); }
    };
    code.addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); go('join'); } });
    el.querySelector('.create-action').append(this._btn('CREATE ROOM', () => go('create'), 'primary'));
    el.querySelector('.join-action').append(this._btn('JOIN ROOM', () => go('join')));
    el.querySelector('.back-action').append(this._btn('BACK', () => {this._leaveOnline(true); this.showMain();}, 'ghost'));
    this.nav.setScope(el, '.primary');
  }
