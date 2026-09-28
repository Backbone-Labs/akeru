/** Kart UI and rendering only. Authority and socket credentials remain outside the title. */
export function installMultiplayer(bridge, getHost) {
  const $ = (s) => document.querySelector(s);
  let snapshot,
    ownId,
    round = -1,
    seq = 0,
    accumulated = 0,
    connected = false,
    lastCount = null,
    arrival = 0;
  let preparedRoster = '';
  const targets = new Map();
  const lobby = $('#multiplayer-panel');
  const status = (text) => {
    if ($('#network-status').textContent !== text)
      $('#network-status').textContent = text;
  };
  const send = (request) => getHost().multiplayer(request);
  const action = (id, callback) => $(id).addEventListener('click', callback);
  action('#create-room', () => send({ action: 'create' }));
  action('#join-room', () => {
    const code = $('#room-code').value.trim().toLowerCase();
    if (!/^[a-f0-9]{20}$/.test(code)) {
      $('#network-status').textContent =
        'Enter the 20-character room code from your friend.';
      return;
    }
    send({ action: 'join', code });
  });
  action('#resume-room', () => send({ action: 'resume' }));
  action('#ready-room', () =>
    send({
      action: 'ready',
      ready: !snapshot?.players.find((p) => p.id === ownId)?.ready,
    }),
  );
  action('#start-room', () => send({ action: 'start' }));
  action('#rematch-room', () => send({ action: 'rematch' }));
  action('#leave-room', () => send({ action: 'leave' }));
  const canResume = () =>
    connected && ['countdown', 'racing'].includes(snapshot?.phase);
  bridge.driving = () => getHost().active && canResume() && lobby.hidden;
  function clearDriving() {
    bridge.controls = {
      throttle: 0,
      brake: 0,
      steer: 0,
      drift: false,
      item: false,
    };
    const input = globalThis.__game?.input;
    input?.keys.clear();
    if (input)
      input.touch = {
        throttle: 0,
        brake: 0,
        steer: 0,
        drift: false,
        item: false,
      };
  }
  function focusTrack() {
    const canvas = $('#scene');
    canvas.tabIndex = -1;
    canvas.focus({ preventScroll: true });
  }
  function showMenu(open) {
    if (!open && !canResume()) return;
    const changed = lobby.hidden === open;
    if (changed) clearDriving();
    if (open && changed) lobby.scrollTop = 0;
    lobby.hidden = !open;
    $('#online-menu').hidden = open || !bridge.online;
    if (changed) {
      if (!open) focusTrack();
      else if (canResume()) $('#resume-race').focus({ preventScroll: true });
    }
  }
  addEventListener('keydown', (event) => {
    if (
      event.code !== 'Escape' ||
      event.repeat ||
      !bridge.online ||
      !getHost().active ||
      !canResume()
    )
      return;
    event.preventDefault();
    showMenu(lobby.hidden);
  });
  action('#online-menu', () => showMenu(lobby.hidden));
  action('#resume-race', () => showMenu(false));
  action('#copy-invite', async () => {
    $('#invite-link').select();
    try {
      await navigator.clipboard.writeText($('#invite-link').value);
      $('#network-status').textContent = 'Invite copied';
    } catch {
      $('#network-status').textContent =
        'Select and copy the invite link above.';
    }
  });
  function exit() {
    document.body.dataset.online = 'false';
    bridge.online = false;
    connected = false;
    snapshot = null;
    round = -1;
    targets.clear();
    bridge.exitOnline?.();
    bridge.clearOnline?.();
    preparedRoster = '';
    document.body.dataset.racing = 'false';
    $('#online-menu').hidden = true;
    $('#room-session').hidden = true;
    $('#room-entry').hidden = false;
    $('#race').disabled = false;
    showMenu(true);
  }
  bridge.receiveMultiplayer = (event) => {
    $('#online-options').hidden = false;
    const message =
      {
        available: 'Private races · 2–4 players',
        connecting: 'Connecting…',
        reconnecting: 'Reconnecting… Your race continues.',
        disconnected: 'Disconnected. Join a new race.',
        error: event.message,
      }[event.status] ?? '';
    if (message) status(message);
    if (event.status === 'available' || event.status === 'disconnected') {
      exit();
      $('#resume-room').hidden = !event.resumable;
      if (event.invite) {
        $('#room-code').value = event.invite;
        if (!event.resumable) send({ action: 'join', code: event.invite });
      }
      return;
    }
    if (event.status === 'error' || event.status === 'reconnecting') {
      connected = false;
      showMenu(true);
      return;
    }
    if (event.status !== 'connected') return;
    connected = true;
    snapshot = event.snapshot;
    ownId = event.sessionId;
    const wasOnline = bridge.online;
    bridge.online = true;
    document.body.dataset.online = 'true';
    if (!wasOnline) document.body.dataset.racing = 'true';
    $('#race').disabled = true;
    $('#room-entry').hidden = true;
    $('#room-session').hidden = false;
    if ($('#invite-link').value !== event.inviteUrl)
      $('#invite-link').value = event.inviteUrl;
    $('#code-label').textContent = snapshot.code;
    const owner = snapshot.owner === ownId;
    const me = snapshot.players.find((p) => p.id === ownId);
    const rows = snapshot.players.map(
      (p) =>
        `${p.name}${p.id === ownId ? ' (you)' : ''} · ${!p.connected ? 'Reconnecting' : p.ready ? 'Ready' : 'Not ready'}`,
    );
    const list = $('#room-players');
    const text = rows.join('\n');
    if (list.textContent !== text) list.textContent = text;
    $('#ready-room').hidden = snapshot.phase !== 'lobby';
    const readyLabel = me?.ready ? 'Unready' : 'Ready · A';
    if ($('#ready-room').textContent !== readyLabel)
      $('#ready-room').textContent = readyLabel;
    $('#resume-race').hidden = !['countdown', 'racing'].includes(
      snapshot.phase,
    );
    $('#resume-race').disabled = !canResume();
    $('#start-room').hidden = !owner || snapshot.phase !== 'lobby';
    $('#start-room').disabled =
      snapshot.players.length < 2 ||
      snapshot.players.some((p) => !p.ready || !p.connected);
    $('#rematch-room').hidden = !owner || snapshot.phase !== 'results';
    if (snapshot.phase === 'lobby') {
      const roster = snapshot.players.map((p) => p.id).join(',');
      if (preparedRoster !== roster) {
        bridge.setupOnline(snapshot.players, ownId, true);
        preparedRoster = roster;
      }
      if (globalThis.__game?.state !== 'menu') bridge.exitOnline();
      showMenu(true);
      status('Ready up. The room owner starts the race.');
      $('#race-results').textContent = '';
      return;
    }
    if (round !== snapshot.round) {
      round = snapshot.round;
      targets.clear();
      bridge.setupOnline(snapshot.players, ownId);
      showMenu(false);
    }
    status('Race in progress. Your controls pause while this menu is open.');
    const game = globalThis.__game;
    game.race.raceTime = snapshot.time;
    game.race.state = snapshot.phase === 'countdown' ? 'countdown' : 'racing';
    arrival = performance.now();
    for (const state of snapshot.karts) {
      const k = game.karts.find((k) => k.networkId === state.id);
      if (!k) continue;
      if (!targets.has(state.id)) k.position.set(state.x, state.y, state.z);
      targets.set(state.id, {
        from: {
          x: k.position.x,
          y: k.position.y,
          z: k.position.z,
          yaw: k.visualYaw,
        },
        state,
      });
      for (const field of [
        'speed',
        'yaw',
        'roll',
        'pitch',
        'steerVisual',
        'grounded',
        'drifting',
        'driftDir',
        'driftTier',
        'boostTime',
        'wheelSpin',
        'lap',
        'rank',
        'progress',
        'finished',
        'finishTime',
      ])
        k[field] = state[field];
      k._surfaceNormal.set(state.nx, state.ny, state.nz);
    }
    game.race.standings = [...game.karts].sort((a, b) => a.rank - b.rank);
    const count = Math.ceil(snapshot.countdown);
    if (count !== lastCount) {
      if (count > 0) {
        game.hud.countdown(count);
        game.audio.count(count);
      } else if (lastCount > 0) {
        game.hud.go();
        game.audio.go();
      }
      lastCount = count;
    }
    if (snapshot.phase === 'results') {
      showMenu(true);
      status('Race complete');
      $('#race-results').textContent = [...snapshot.karts]
        .sort((a, b) => a.rank - b.rank)
        .map(
          (k) =>
            `${k.rank}. ${snapshot.players.find((p) => p.id === k.id)?.name ?? 'Departed racer'} · ${k.dnf ? 'Did not finish' : k.finishTime.toFixed(2) + 's'}`,
        )
        .join('\n');
    }
  };
  bridge.networkTick = (dt, input) => {
    accumulated += dt;
    if (!connected || !snapshot || accumulated < 1 / 30) return;
    accumulated = 0;
    const active = bridge.driving() && snapshot.phase === 'racing';
    send({
      action: 'input',
      input: {
        seq: seq++,
        throttle: active ? input.throttle : 0,
        brake: active ? input.brake : 0,
        steer: active ? input.steer : 0,
        drift: active && input.drift,
      },
    });
  };
  bridge.networkFrame = () => {
    const t = Math.min(1, (performance.now() - arrival) / 50);
    for (const k of globalThis.__game?.karts ?? []) {
      const target = targets.get(k.networkId);
      if (!target) continue;
      const { from, state } = target;
      k.position.set(
        from.x + (state.x - from.x) * t,
        from.y + (state.y - from.y) * t,
        from.z + (state.z - from.z) * t,
      );
      const angle = Math.atan2(
        Math.sin(state.visualYaw - from.yaw),
        Math.cos(state.visualYaw - from.yaw),
      );
      k.visualYaw = from.yaw + angle * t;
    }
  };
  return {
    pause(paused) {
      clearDriving();
      // The host pause panel is the active menu; don't require a second resume.
      if (bridge.online && canResume()) {
        if (paused) showMenu(false);
        else if (lobby.hidden) focusTrack();
      }
    },
    action(value) {
      if (!bridge.online && $('#online-options').hidden) return false;
      if (bridge.online && lobby.hidden) {
        if (value === 'menu') showMenu(true);
        return true;
      }
      const controls = [
        ...document.querySelectorAll(
          '#akeru-start button, #multiplayer-panel button, #multiplayer-panel input',
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      if (['left', 'right', 'up', 'down'].includes(value)) {
        const current = controls.indexOf(document.activeElement);
        controls[
          (current +
            (['up', 'left'].includes(value) ? -1 : 1) +
            controls.length) %
            controls.length
        ]?.focus();
      } else if (value === 'confirm') {
        const el = controls.includes(document.activeElement)
          ? document.activeElement
          : controls[0];
        el?.focus();
        if (el?.tagName === 'BUTTON') el.click();
      } else if (value === 'cancel' && bridge.online && canResume())
        showMenu(false);
      return true;
    },
  };
}
