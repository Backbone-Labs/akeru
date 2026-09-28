import { createMatch, MAP } from '../../../dist/blackline-server/match.js';
import { createPlayer } from '../../../dist/blackline-server/player.js';
import { neutral } from './protocol.js';
export const STEP = 1 / 60;
const ARMORY = [
  { rpm: 720, mag: 30, reserve: 120, reload: 2.1 },
  { rpm: 900, mag: 32, reserve: 160, reload: 1.7 },
  { rpm: 420, mag: 12, reserve: 48, reload: 1.5 },
];
export class BlacklineSimulation {
  constructor(
    players,
    {
      scoreLimit = 75,
      timeLimit = 600000,
      respawnDelay = 5000,
      bots = true,
      countdown = 3,
    } = {},
  ) {
    this.match = createMatch({ scoreLimit, timeLimit, respawnDelay });
    this.controllers = new Map();
    this.time = 0;
    this.countdown = countdown;
    this.eventSeq = 0;
    this.events = [];
    for (const p of players) {
      const e = this.match.makeEnt(p.name, p.slot % 2, true);
      this.match.ents.set(e.id, e);
      this.match.respawn(e);
      const actor = createPlayer({
        world: { colliders: MAP.boxes },
        bus: { emit() {} },
      });
      const c = {
        entity: e,
        actor,
        wasJump: false,
        wasFire: false,
        lastSpawn: null,
        seq: -1,
      };
      this.controllers.set(p.id, c);
      this.resetOperator(c);
    }
    if (bots) this.match.balanceBots();
    this.collectEvents();
  }
  get done() {
    return this.match.phase === 'end';
  }
  resetOperator(c) {
    const e = c.entity;
    c.actor.pos.set(...e.p);
    c.actor.vel.set(0, 0, 0);
    c.actor.yaw = e.yaw;
    c.actor.pitch = e.pitch;
    c.actor.alive = true;
    c.actor.grounded = true;
    c.actor._jumpBuf = 0;
    c.lastSpawn = e.protUntil;
    c.mag = ARMORY.map((w) => w.mag);
    c.reserve = ARMORY.map((w) => w.reserve);
    c.reloadUntil = 0;
    c.shotAfter = 0;
    c.switchUntil = 0;
  }
  collectEvents() {
    for (const ev of this.match.events.splice(0))
      this.events.push({ ...ev, seq: ++this.eventSeq });
    this.events = this.events.slice(-128);
  }
  step(inputs = new Map()) {
    if (this.done) return;
    this.time += STEP;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - STEP);
      return;
    }
    for (const [id, c] of this.controllers) {
      const e = c.entity,
        a = c.actor;
      // A new authoritative spawn resets position, velocity and ammunition.
      if (e.alive && !a.alive) this.resetOperator(c);
      a.alive = e.alive;
      const input = inputs.get(id) ?? neutral(e.yaw, e.pitch, e.w);
      if (Number.isSafeInteger(input.seq)) c.seq = input.seq;
      if (!e.alive) {
        c.wasJump = false;
        c.wasFire = false;
        continue;
      }
      a.yaw = input.yaw;
      a.pitch = input.pitch;
      a._keys = {
        KeyW: input.moveY < -0.15,
        KeyS: input.moveY > 0.15,
        KeyA: input.moveX < -0.15,
        KeyD: input.moveX > 0.15,
        ShiftLeft: input.sprint,
        ControlLeft: input.crouch,
      };
      if (input.jump && !c.wasJump) a._jumpBuf = 0.12;
      c.wasJump = input.jump;
      a._physics(STEP);
      e.p = [a.pos.x, a.pos.y, a.pos.z];
      e.yaw = a.yaw;
      e.pitch = a.pitch;
      e.st =
        (a.crouching ? 1 : 0) | (a.sprinting ? 2 : 0) | (!a.grounded ? 4 : 0);
      if (input.weapon !== e.w) {
        e.w = input.weapon;
        c.reloadUntil = 0;
        c.switchUntil = this.time + 0.3;
      }
      const w = ARMORY[e.w];
      if (c.reloadUntil && this.time >= c.reloadUntil) {
        const n = Math.min(w.mag - c.mag[e.w], c.reserve[e.w]);
        c.mag[e.w] += n;
        c.reserve[e.w] -= n;
        c.reloadUntil = 0;
      }
      if (
        input.reload &&
        !c.reloadUntil &&
        c.mag[e.w] < w.mag &&
        c.reserve[e.w] > 0
      )
        c.reloadUntil = this.time + w.reload;
      if (c.reloadUntil) e.st |= 16;
      if (
        input.fire &&
        (e.w !== 2 || !c.wasFire) &&
        !a.sprinting &&
        !c.reloadUntil &&
        this.time >= c.switchUntil &&
        this.time >= c.shotAfter &&
        c.mag[e.w] > 0
      ) {
        c.mag[e.w]--;
        c.shotAfter = this.time + 60 / w.rpm;
        e.protUntil = 0;
        const o = this.match.eyeOf(e),
          cp = Math.cos(e.pitch);
        const d = [
          -Math.sin(e.yaw) * cp,
          Math.sin(e.pitch),
          -Math.cos(e.yaw) * cp,
        ];
        this.match.pushEv({ k: 'shot', i: e.id, o, d, w: e.w });
        this.match.hitscan(e, o, d, e.w);
      }
      c.wasFire = input.fire;
    }
    this.match.step(STEP);
    this.collectEvents();
  }
  retire(id) {
    const c = this.controllers.get(id);
    if (!c) return;
    this.match.ents.delete(c.entity.id);
    this.controllers.delete(id);
    if (!this.done) this.match.balanceBots();
    this.collectEvents();
  }
  entity(id) {
    return this.controllers.get(id)?.entity;
  }
  snapshot(id) {
    const c = this.controllers.get(id),
      e = c?.entity;
    return {
      cfg: this.match.CFG,
      time: this.match.now,
      tick: Math.round(this.time / STEP),
      timeLeft: Math.max(0, Math.round(this.match.timeLeft)),
      scores: [...this.match.scores],
      phase: this.done ? 'end' : 'play',
      ps: [...this.match.ents.values()].map((e) => [
        e.id,
        e.team,
        e.name,
        ...e.p.map((n) => +n.toFixed(3)),
        +e.yaw.toFixed(4),
        +e.pitch.toFixed(4),
        e.st | (e.alive ? 0 : 8),
        e.w,
        Math.round(e.hp),
        e.kills,
        e.deaths,
      ]),
      you: e
        ? {
            id: e.id,
            hp: Math.max(0, Math.round(e.hp)),
            alive: e.alive,
            p: [...e.p],
            velocity: [c.actor.vel.x, c.actor.vel.y, c.actor.vel.z],
            yaw: e.yaw,
            pitch: e.pitch,
            ackSeq: c.seq,
            respawnIn: e.alive ? 0 : Math.max(0, e.respawnAt - this.match.now),
            kills: e.kills,
            deaths: e.deaths,
            st: e.st,
            weapon: e.w,
            ammo: [...c.mag],
            reserve: [...c.reserve],
            reloadIn: Math.max(0, c.reloadUntil - this.time),
          }
        : null,
    };
  }
}
