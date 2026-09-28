/** Presentation and intent only. Room credentials and sockets remain in the host. */
export function installMultiplayer(game, getHost) {
  const panel = document.querySelector('#akeru-room-panel');
  panel.innerHTML = `<h2>Squad up.</h2><p id="room-status" role="status">Connecting to Akeru…</p>
    <div id="room-entry"><button id="create-room">Create private room</button><label>Invite code<input id="join-code" autocomplete="off" maxlength="20" placeholder="20-character room code"></label><button id="join-room">Join room</button><button id="resume-room" hidden>Rejoin room</button></div>
    <div id="room-membership" hidden><p>Room <strong id="code-label"></strong></p><label>Invite a friend<input id="invite-link" readonly></label><button id="copy-invite">Copy invite</button><ul id="room-players"></ul><div class="room-actions"><button id="ready-room">Ready · A</button><button id="start-room">Start match</button><button id="rematch-room" hidden>Play again</button><button id="leave-room">Leave room</button></div></div>
    <p class="room-note">2–10 guests · 5v5 teams filled with bots · Guest settings save locally. Matches continue while menus are open.</p>`;
  const countdown = document.createElement('div');
  countdown.id = 'match-countdown';
  countdown.hidden = true;
  document.body.append(countdown);
  const el = (id) => document.getElementById(id);
  let event = {},
    snapshot,
    round = -1,
    lastEvent = -1,
    seq = 0,
    firePulse = false,
    reloadPulse = false,
    elapsed = 0;
  let pendingReady = null;
  const send = (request) => getHost().multiplayer(request);
  const status = (text) => {
    el('room-status').textContent = text;
  };
  game.akeruLobbyOpen = true;
  el('create-room').onclick = () => send({ action: 'create' });
  el('join-room').onclick = () => {
    const code = el('join-code').value.trim().toLowerCase();
    if (!/^[a-f0-9]{20}$/.test(code))
      return status('Enter the 20-character invite code.');
    send({ action: 'join', code });
  };
  el('resume-room').onclick = () => send({ action: 'resume' });
  el('ready-room').onclick = () => {
    const you = snapshot?.players.find((p) => p.id === event.sessionId);
    if (!you || snapshot.phase !== 'lobby') return;
    pendingReady = !(pendingReady ?? you.ready);
    send({ action: 'ready', ready: pendingReady });
    el('ready-room').textContent = pendingReady ? 'Unready' : 'Ready · A';
  };
  el('start-room').onclick = () => send({ action: 'start' });
  el('rematch-room').onclick = () => send({ action: 'rematch' });
  el('leave-room').onclick = leave;
  el('copy-invite').onclick = async () => {
    el('invite-link').select();
    try {
      await navigator.clipboard.writeText(el('invite-link').value);
      status('Invite copied.');
    } catch {
      status('Copy the selected invite and send it to your friend.');
    }
  };
  game.bus.on('wpn:fired', () => {
    firePulse = true;
  });
  const originalReload = game.weapons.reload.bind(game.weapons);
  game.weapons.reload = () => {
    reloadPulse = true;
    originalReload();
  };
  function resetMenu() {
    countdown.hidden = true;
    game.akeruLobbyOpen = true;
    game.engine.menuCam = true;
    game.menus.phase = game.state.phase = 'menu';
    for (const id of ['loading-screen', 'pause-overlay', 'end-screen', 'hud'])
      game.menus.els[id].hidden = true;
    game.menus.els.menu.hidden = false;
    game.menus.hideHint();
    game.player._clearKeys();
    try {
      document.exitPointerLock?.();
    } catch {
      /* optional */
    }
  }
  function leave() {
    send({ action: 'leave' });
    snapshot = null;
    round = -1;
    lastEvent = -1;
    game.state.players.clear();
    game.net.snaps.length = 0;
    resetMenu();
    render();
  }
  function render() {
    const joined = !!snapshot;
    el('room-entry').hidden = joined;
    el('room-membership').hidden = !joined;
    if (!joined) return;
    el('code-label').textContent = snapshot.code;
    // Keep the input and buttons stable while 20 Hz snapshots arrive (pointerup must
    // target the same element as pointerdown). Only update changed values/text.
    if (el('invite-link').value !== event.inviteUrl)
      el('invite-link').value = event.inviteUrl || '';
    const players = snapshot.players.map(
      (p) =>
        `${p.name}${p.id === event.sessionId ? ' (you)' : ''} · ${!p.connected ? 'Reconnecting' : p.ready ? 'Ready' : 'Not ready'}`,
    );
    if (el('room-players').textContent !== players.join(''))
      el('room-players').replaceChildren(
        ...players.map((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          return li;
        }),
      );
    const you = snapshot.players.find((p) => p.id === event.sessionId);
    if (pendingReady === you?.ready) pendingReady = null;
    const readyLabel = (pendingReady ?? you?.ready) ? 'Unready' : 'Ready · A';
    if (el('ready-room').textContent !== readyLabel)
      el('ready-room').textContent = readyLabel;
    el('ready-room').hidden = snapshot.phase !== 'lobby';
    el('start-room').hidden = snapshot.phase !== 'lobby';
    el('start-room').disabled =
      snapshot.owner !== event.sessionId ||
      snapshot.players.length < 2 ||
      snapshot.players.some((p) => !p.ready || !p.connected);
    el('rematch-room').hidden = snapshot.phase !== 'results';
    el('rematch-room').disabled = snapshot.owner !== event.sessionId;
  }
  function receive(next) {
    event = { ...event, ...next };
    if (next.status === 'available') {
      el('resume-room').hidden = !next.resumable;
      status('Create a private room or join a friend.');
      if (next.invite && !next.resumable)
        send({ action: 'join', code: next.invite });
    } else if (next.status === 'error')
      status(next.message || 'Could not join. Try a new invite.');
    else if (next.status === 'connecting') status('Joining room…');
    else if (next.status === 'reconnecting') {
      status('Reconnecting…');
      game.bus.emit('net:down');
    } else if (next.status === 'disconnected') {
      snapshot = null;
      round = -1;
      lastEvent = -1;
      pendingReady = null;
      resetMenu();
      status('Disconnected. Create a room or join again.');
    }
    if (!next.snapshot) return render();
    snapshot = next.snapshot;
    game.akeruMatchReady = snapshot.phase === 'playing';
    countdown.hidden = snapshot.phase !== 'countdown';
    countdown.textContent = `Match starts in ${Math.ceil(snapshot.countdown || 0)}`;
    const you = snapshot.players.find((p) => p.id === event.sessionId);
    if (snapshot.round !== round) {
      round = snapshot.round;
      lastEvent = -1;
      pendingReady = null;
      game.net.snaps.length = 0;
      game.state.match.phase = null;
    }
    if (snapshot.phase === 'lobby') {
      resetMenu();
      status('Ready up. The room owner starts the match.');
    } else if (snapshot.packets && you) {
      const packet = snapshot.packets;
      game.net.myId = game.state.myId = you.entityId;
      game.net.team = game.state.team = you.team;
      const starting = game.akeruLobbyOpen || game.menus.phase === 'down';
      if (starting && snapshot.phase !== 'results') {
        game.akeruLobbyOpen = false;
        game.engine.menuCam = false;
        game.menus.phase = game.state.phase = 'loading';
        game.bus.emit('net:welcome', {
          you: { id: you.entityId, team: you.team },
          cfg: packet.cfg,
        });
      }
      // A join/resume hydrates current state, never replays old combat or spawn events.
      if (lastEvent < 0 || starting) {
        lastEvent = snapshot.events.at(-1)?.seq ?? 0;
        if (packet.you?.alive) game.player._revive();
      } else {
        for (const ev of snapshot.events)
          if (ev.seq > lastEvent) {
            lastEvent = ev.seq;
            game.bus.emit('net:event', ev);
          }
      }
      // Apply current authority after events so an old spawn can never revive a dead player.
      game.net._onSnap(packet);
      const authoritative = packet.you;
      if (authoritative) {
        seq = Math.max(seq, authoritative.ackSeq + 1);
        // Predict locally between snapshots; reconcile server-owned position and ammo.
        game.player.pos.set(...authoritative.p);
        game.player.vel.set(...authoritative.velocity);
        if (starting) {
          if (
            Number.isInteger(authoritative.weapon) &&
            game.weapons.idx !== authoritative.weapon
          )
            game.weapons.switchTo(authoritative.weapon);
          game.player.yaw = authoritative.yaw;
          game.player.pitch = authoritative.pitch;
        }
        game.weapons.mags = [...authoritative.ammo];
        game.weapons.reserves = [...authoritative.reserve];
      }
      if (snapshot.phase === 'results') {
        resetMenu();
        status(
          `Match complete · ${packet.scores.join(' – ')}. The owner can start a rematch.`,
        );
      } else if (snapshot.phase === 'countdown')
        status(`Match starts in ${Math.ceil(snapshot.countdown)}…`);
    }
    render();
  }
  game.onLoop((dt) => {
    elapsed += dt;
    if (elapsed < 0.05) return;
    elapsed = 0;
    if (
      !getHost().active ||
      game.akeruLobbyOpen ||
      game.state.phase !== 'playing' ||
      snapshot?.phase !== 'playing'
    ) {
      firePulse = reloadPulse = false;
      return;
    }
    const k = game.player._keys,
      c = game.akeruControlState;
    const custom = game.akeruInputActive;
    send({
      action: 'input',
      input: {
        seq: seq++,
        moveX: custom ? c.moveX : Number(!!k.KeyD) - Number(!!k.KeyA),
        moveY: custom ? c.moveY : Number(!!k.KeyS) - Number(!!k.KeyW),
        yaw: Math.atan2(Math.sin(game.player.yaw), Math.cos(game.player.yaw)),
        pitch: Math.max(-1.51, Math.min(1.51, game.player.pitch)),
        weapon: game.weapons.idx,
        jump: custom ? c.jump : !!k.Space,
        crouch: custom ? c.crouch : !!k.ControlLeft,
        sprint: custom ? c.sprint : !!k.ShiftLeft,
        fire: firePulse || (custom ? c.fire : !!game.weapons._trigger),
        reload: reloadPulse || (custom && c.reload),
      },
    });
    firePulse = reloadPulse = false;
  }, 30);
  return { receive, leave };
}
