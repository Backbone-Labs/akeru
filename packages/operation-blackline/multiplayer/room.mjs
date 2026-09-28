import { randomBytes } from 'node:crypto';
import { Room, ServerError } from '@colyseus/core';
import { BlacklineSimulation, STEP } from './simulation.mjs';
import { BLACKLINE_BUILD, validRequest, neutral } from './protocol.js';
import { exact } from '../../multiplayer/src/protocol.js';
let liveRooms = 0;
export class BlacklineRoom extends Room {
  onCreate() {
    if (liveRooms >= 100) throw new ServerError(503, 'This worker is full');
    liveRooms++;
    this.counted = true;
    this.roomId = randomBytes(10).toString('hex');
    this.maxClients = 10;
    this.seatReservationTimeout = 60;
    this.maxMessagesPerSecond = 50;
    this.setPrivate(true);
    this.players = new Map();
    this.phase = 'lobby';
    this.owner = null;
    this.round = 0;
    this.tick = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.onMessage('command', (client, command) =>
      this.command(client, command),
    );
    this.setSimulationInterval((ms) => this.advance(ms), 1000 / 60);
    this.clock.setTimeout(() => this.disconnect(), 30 * 60 * 1000);
  }
  static onAuth(_token, options) {
    if (!exact(options, ['build']) || options.build !== BLACKLINE_BUILD)
      throw new ServerError(400, 'Incompatible game version');
    return true;
  }
  onJoin(client) {
    const slots = new Set([...this.players.values()].map((p) => p.slot));
    const slot = Array.from({ length: 10 }, (_, i) => i).find(
      (s) => !slots.has(s),
    );
    if (slot === undefined || this.phase !== 'lobby')
      throw Error('Room is full or racing');
    this.players.set(client.sessionId, {
      id: client.sessionId,
      slot,
      name: `Operator ${slot + 1}`,
      ready: false,
      connected: true,
      input: neutral(),
      seq: -1,
      lastInput: 0,
    });
    for (const p of this.players.values()) p.ready = false;
    this.owner ??= client.sessionId;
    this.publish();
  }
  command(client, v) {
    const p = this.players.get(client.sessionId);
    if (!p || !validRequest(v)) return;
    if (v.action === 'input') {
      if (v.input.seq <= p.seq) return;
      p.seq = v.input.seq;
      p.input = v.input;
      p.lastInput = this.elapsed;
      return;
    }
    // Ready is an idempotent set, not a toggle; never discard a newer choice.
    // Start/rematch are already gated by phase. The per-client rate limit applies.
    if (v.action === 'ready' && this.phase === 'lobby') p.ready = v.ready;
    else if (
      v.action === 'start' &&
      client.sessionId === this.owner &&
      this.phase === 'lobby' &&
      this.players.size >= 2 &&
      [...this.players.values()].every((p) => p.ready && p.connected)
    ) {
      this.simulation = new BlacklineSimulation([...this.players.values()]);
      this.phase = 'countdown';
      this.round++;
      void this.lock();
    } else if (
      v.action === 'rematch' &&
      client.sessionId === this.owner &&
      this.phase === 'results'
    ) {
      this.simulation = null;
      this.phase = 'lobby';
      for (const p of this.players.values()) {
        p.ready = false;
        p.input = neutral();
      }
      void this.unlock();
    }
    this.publish();
  }
  advance(ms) {
    this.elapsed += ms / 1000;
    this.accumulator = Math.min(this.accumulator + ms / 1000, 0.15);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      const inputs = new Map(
        [...this.players.values()].map((p) => [
          p.id,
          p.connected && this.elapsed - p.lastInput < 0.25
            ? p.input
            : neutral(
                this.simulation?.entity(p.id)?.yaw ?? 0,
                this.simulation?.entity(p.id)?.pitch ?? 0,
                this.simulation?.entity(p.id)?.w ?? 0,
              ),
        ]),
      );
      this.simulation?.step(inputs);
      if (this.simulation)
        this.phase = this.simulation.done
          ? 'results'
          : this.simulation.countdown > 0
            ? 'countdown'
            : 'playing';
      if (++this.tick % 3 === 0) this.publish();
    }
    if (this.phase === 'lobby' && this.elapsed > 300 && this.round === 0)
      void this.disconnect();
  }
  publish() {
    const common = {
      build: BLACKLINE_BUILD,
      code: this.roomId,
      owner: this.owner,
      phase: this.phase,
      round: this.round,
      tick: this.tick,
      time: this.simulation?.time ?? 0,
      countdown: this.simulation?.countdown ?? 0,
      players: [...this.players.values()].map(
        ({ id, slot, name, ready, connected }) => ({
          id,
          slot,
          name,
          ready,
          connected,
          entityId: this.simulation?.entity(id)?.id ?? null,
          team: slot % 2,
        }),
      ),
      events: this.simulation?.events ?? [],
    };
    for (const client of this.clients)
      client.send('snapshot', {
        ...common,
        packets: this.simulation?.snapshot(client.sessionId) ?? null,
      });
  }
  onDrop(client) {
    const p = this.players.get(client.sessionId);
    if (p) {
      p.connected = false;
      p.input = neutral();
    }
    this.publish();
    void this.allowReconnection(client, 30).catch(() => {});
  }
  onReconnect(client) {
    const p = this.players.get(client.sessionId);
    if (p) {
      p.connected = true;
      p.input = neutral();
      p.seq = -1;
    }
    this.publish();
  }
  onDispose() {
    if (this.counted) {
      liveRooms--;
      this.counted = false;
    }
  }
  onLeave(client) {
    this.players.delete(client.sessionId);
    this.simulation?.retire(client.sessionId);
    if (this.owner === client.sessionId)
      this.owner = this.players.keys().next().value ?? null;
    this.publish();
  }
}
