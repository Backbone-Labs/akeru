import { SnapshotBuffer, KartPrediction } from './network-motion.js';
import { STEP } from './network-state.js';
/** Kart UI and rendering only. Authority and socket credentials remain outside the title. */
export function installMultiplayer(bridge, getHost) {
  const $ = (s) => document.querySelector(s);
  let snapshot,
    ownId,
    round = -1,
    seq = 0,
    accumulated = 0,
    connected = false,
    lastCount = null;
  let prediction = null,
    command = null,
    commandIndex = 0,
    predictionTime = 0;
  let preparedRoster = '';
  const buffers = new Map();
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
    buffers.clear();
    prediction = null;
    command = null;
    commandIndex = 0;
    predictionTime = 0;
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
      prediction = null;
      command = null;
      commandIndex = 0;
      accumulated = 0;
      showMenu(true);
      return;
    }
    if (event.status !== 'connected') return;
    if (
      snapshot &&
      snapshot.code === event.snapshot.code &&
      (event.snapshot.round < snapshot.round ||
        (event.snapshot.round === snapshot.round &&
          event.snapshot.tick < snapshot.tick))
    )
      return;
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
      buffers.clear();
      prediction = null;
      command = null;
      commandIndex = 0;
      predictionTime = 0;
      bridge.setupOnline(snapshot.players, ownId);
      showMenu(false);
    }
    status('Race in progress. Your controls pause while this menu is open.');
    const game = globalThis.__game;
    game.race.raceTime = snapshot.time;
    game.race.state = snapshot.phase === 'countdown' ? 'countdown' : 'racing';
    const now = performance.now() / 1000;
    for (const state of snapshot.karts) {
      const k = game.karts.find((k) => k.networkId === state.id);
      if (!k) continue;
      if (!buffers.has(state.id)) buffers.set(state.id, new SnapshotBuffer());
      buffers.get(state.id).push(snapshot.tick * STEP, state, now);
      // Results, lap counts and standings never come from local prediction.
      for (const key of ['lap', 'rank', 'progress', 'finished', 'finishTime'])
        k[key] = state[key];
    }
    if (snapshot.you && bridge.predictionActor) {
      seq = Math.max(seq, snapshot.you.ackSeq + 1);
      prediction ??= new KartPrediction(
        bridge.predictionActor,
        bridge.predictionTrack,
      );
      if (!getHost().active || snapshot.phase !== 'racing')
        prediction.ready = false;
      prediction.reconcile(snapshot.you, now);
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
    if (!connected || !snapshot) return;
    accumulated += dt;
    while (accumulated >= STEP) {
      accumulated -= STEP;
      predictionTime = accumulated;
      if (
        !getHost().active ||
        snapshot.phase !== 'racing' ||
        globalThis.__game.player.finished ||
        !prediction?.ready ||
        performance.now() / 1000 - prediction.lastSnapshot > 0.25
      )
        continue;
      if (!command || commandIndex >= 2) {
        const active = bridge.driving() && !globalThis.__game.player.finished;
        command = {
          seq: seq++,
          throttle: active ? input.throttle : 0,
          brake: active ? input.brake : 0,
          steer: active ? input.steer : 0,
          drift: active && input.drift,
        };
        commandIndex = 0;
        send({ action: 'input', input: command });
      }
      prediction.advance(command, command.seq, ++commandIndex);
    }
    predictionTime = accumulated;
  };
  bridge.networkFrame = (dt) => {
    const now = performance.now() / 1000;
    for (const k of globalThis.__game?.karts ?? []) {
      const predicted =
        connected &&
        k.isPlayer &&
        !k.finished &&
        getHost().active &&
        snapshot?.phase === 'racing' &&
        prediction?.ready &&
        now - prediction.lastSnapshot < 0.25;
      const state = predicted
        ? prediction.render(predictionTime / STEP, dt)
        : buffers.get(k.networkId)?.sample(now);
      if (!state) continue;
      k.position.set(state.x, state.y, state.z);
      for (const field of [
        'speed',
        'yaw',
        'visualYaw',
        'roll',
        'pitch',
        'steerVisual',
        'grounded',
        'drifting',
        'driftDir',
        'driftTier',
        'boostTime',
        'wheelSpin',
      ])
        k[field] = state[field];
      k.suspension = [...state.suspension];
      k._surfaceNormal.set(state.nx, state.ny, state.nz);
    }
  };
  return {
    pause(paused) {
      clearDriving();
      command = null;
      commandIndex = 0;
      accumulated = 0;
      if (prediction) {
        prediction.history = [];
        if (paused) prediction.ready = false;
      }
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
