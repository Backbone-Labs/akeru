/** Fixed-step prediction is presentation only; every checkpoint comes from the server. */
export const MOTION_STEP = 1 / 60;
const position = (actor) => [actor.pos.x, actor.pos.y, actor.pos.z];
const fields = [
  'grounded',
  'crouching',
  'sprinting',
  '_height',
  '_jumpBuf',
  '_wasSprint',
];
const cosmeticFields = [
  '_eye',
  '_bobPhase',
  '_bobY',
  '_bobX',
  '_dip',
  '_dipV',
  '_footAcc',
  '_deadT',
];
export function movementState(actor, wasJump) {
  return {
    ...Object.fromEntries(fields.map((key) => [key, actor[key]])),
    wasJump,
  };
}
export function advanceMovement(actor, input, previousJump = false) {
  const keys = actor._keys;
  actor.yaw = input.yaw;
  actor.pitch = input.pitch;
  actor._keys = {
    KeyW: input.moveY < -0.15,
    KeyS: input.moveY > 0.15,
    KeyA: input.moveX < -0.15,
    KeyD: input.moveX > 0.15,
    ShiftLeft: input.sprint,
    ControlLeft: input.crouch,
  };
  if (input.jump && !previousJump) actor._jumpBuf = 0.12;
  actor._physics(MOTION_STEP);
  actor._keys = keys;
  return input.jump;
}
export class OperatorPrediction {
  constructor(actor, step = advanceMovement) {
    this.actor = actor;
    this.step = step;
    this.history = [];
    this.offset = [0, 0, 0];
    this.previous = position(actor);
    this.ordinal = 0;
    this.seq = -1;
    this.wasJump = false;
    this.lastTick = -1;
    this.spawn = -1;
    this.alive = null;
    this.overflow = false;
  }
  clear() {
    this.history.length = 0;
    this.offset.fill(0);
    this.previous = position(this.actor);
    this.wasJump = false;
    this.lastTick = -1;
    this.overflow = false;
  }
  predict(input) {
    if (input.seq !== this.seq) {
      this.seq = input.seq;
      this.ordinal = 0;
    }
    this.previous = position(this.actor);
    this.wasJump = this.step(this.actor, input, this.wasJump, false);
    this.history.push({ input: { ...input }, ordinal: ++this.ordinal });
    if (this.history.length > 120) {
      this.history.shift();
      this.overflow = true;
    }
  }
  reconcile(state, tick, { reset = false } = {}) {
    if (tick <= this.lastTick && !reset) return false;
    this.lastTick = tick;
    const old = position(this.actor),
      yaw = this.actor.yaw,
      pitch = this.actor.pitch;
    const cosmetics = Object.fromEntries(
      cosmeticFields.map((key) => [key, this.actor[key]]),
    );
    const discontinuity =
      reset ||
      this.overflow ||
      state.spawn !== this.spawn ||
      state.alive !== this.alive ||
      Math.hypot(...old.map((v, i) => v - state.p[i])) > 8;
    this.spawn = state.spawn;
    this.overflow = false;
    this.alive = state.alive;
    this.history = discontinuity
      ? []
      : this.history.filter(
          (f) =>
            f.input.seq > state.ackSeq ||
            (f.input.seq === state.ackSeq && f.ordinal > state.inputTicks),
        );
    this.actor.pos.set(...state.p);
    this.actor.vel.set(...state.velocity);
    this.actor.alive = state.alive;
    for (const key of fields)
      if (state.motion?.[key] !== undefined)
        this.actor[key] = state.motion[key];
    this.wasJump = state.motion?.wasJump ?? false;
    this.previous = [...state.p];
    for (const frame of this.history) {
      this.previous = position(this.actor);
      this.wasJump = this.step(this.actor, frame.input, this.wasJump, true);
    }
    // Replayed physics must not replay camera bob, footsteps or landing motion.
    Object.assign(this.actor, cosmetics);
    // Aim is immediate local input. Replaying older commands must not rewind it.
    this.actor.yaw = discontinuity ? state.yaw : yaw;
    this.actor.pitch = discontinuity ? state.pitch : pitch;
    const corrected = position(this.actor);
    if (discontinuity) {
      this.offset.fill(0);
      this.previous = corrected;
    } else this.offset = this.offset.map((v, i) => v + old[i] - corrected[i]);
    return true;
  }
  cameraOffset(dt, alpha = 1) {
    const current = position(this.actor),
      decay = Math.exp(-Math.max(0, dt) / 0.09);
    this.offset = this.offset.map((v) => v * decay);
    return this.offset.map(
      (v, i) => v + (this.previous[i] - current[i]) * (1 - alpha),
    );
  }
}

/** Arrival jitter never changes the spacing of authoritative server samples. */
export class RemoteTimeline {
  constructor(delay = 120) {
    this.delay = delay;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.offsets = [];
    this.cursor = null;
    this.lastNow = null;
    this.lastArrival = null;
  }
  push(packet, now) {
    if (
      !Number.isFinite(packet.time) ||
      packet.time <= (this.samples.at(-1)?.time ?? -1)
    )
      return;
    this.samples.push(packet);
    if (this.samples.length > 40) this.samples.shift();
    this.offsets.push(now - packet.time);
    if (this.offsets.length > 40) this.offsets.shift();
    if (this.cursor === null) {
      this.cursor = packet.time - this.delay;
      this.lastNow = now;
    } else if (
      now - this.lastArrival > 500 ||
      this.cursor < this.samples[0].time - this.delay
    ) {
      // After a stalled connection, resume near live time instead of chasing seconds of backlog.
      this.cursor = Math.max(this.cursor, packet.time - this.delay);
      this.lastNow = now;
    }
    this.lastArrival = now;
  }
  getTransform(id, out, now) {
    if (!this.samples.length) return null;
    const dt = Math.max(0, now - this.lastNow),
      latest = this.samples.at(-1);
    const target = now - Math.min(...this.offsets) - this.delay;
    if (dt > 500) this.cursor = Math.max(this.cursor, latest.time - this.delay);
    else
      this.cursor +=
        dt *
        (1 +
          Math.max(-0.05, Math.min(0.05, (target - this.cursor - dt) / 1000)));
    this.cursor = Math.min(this.cursor, latest.time);
    this.lastNow = now;
    let a = this.samples[0],
      b = a;
    for (const sample of this.samples) {
      if (sample.time <= this.cursor) a = sample;
      else {
        b = sample;
        break;
      }
      b = sample;
    }
    let ra = a.ps.find((row) => row[0] === id),
      rb = b.ps.find((row) => row[0] === id);
    if (!ra) return null;
    rb ??= ra;
    const alpha =
      b.time > a.time
        ? Math.max(0, Math.min(1, (this.cursor - a.time) / (b.time - a.time)))
        : 0;
    // Keep the old pose until the respawn sample's server time, never lerp through walls.
    if (
      Math.hypot(rb[3] - ra[3], rb[4] - ra[4], rb[5] - ra[5]) > 8 ||
      !!(ra[8] & 8) !== !!(rb[8] & 8)
    )
      rb = ra;
    const src = alpha < 1 ? ra : rb;
    out.name = src[2];
    out.team = src[1];
    out.flags = src[8];
    out.w = src[9];
    out.hp = src[10];
    out.p = [3, 4, 5].map((i) => ra[i] + (rb[i] - ra[i]) * alpha);
    const angle = Math.atan2(Math.sin(rb[6] - ra[6]), Math.cos(rb[6] - ra[6]));
    out.yaw = ra[6] + angle * alpha;
    out.pitch = ra[7] + (rb[7] - ra[7]) * alpha;
    return out;
  }
}
