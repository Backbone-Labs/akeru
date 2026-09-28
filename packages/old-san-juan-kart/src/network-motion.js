import { capturePhysics, restorePhysics, pose, STEP } from './network-state.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const continuous = [
  'x',
  'y',
  'z',
  'speed',
  'pitch',
  'roll',
  'steerVisual',
  'wheelSpin',
  'nx',
  'ny',
  'nz',
  'boostTime',
];
export function interpolate(a, b, t) {
  // Respawns are discontinuities, not trajectories through buildings.
  if (a.teleport !== b.teleport || distance(a, b) > 12) return { ...b };
  const out = { ...a };
  for (const k of continuous) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of ['yaw', 'visualYaw']) out[k] = angle(a[k], b[k], t);
  out.suspension = a.suspension.map((v, i) => v + (b.suspension[i] - v) * t);
  return out;
}
/** A stable server-time playback clock absorbs delivery jitter before rendering. */
export class SnapshotBuffer {
  constructor(delay = 0.12) {
    this.delay = delay;
    this.samples = [];
    this.cursor = null;
    this.lastNow = null;
  }
  push(time, state, now) {
    if (this.samples.length && time <= this.samples.at(-1).time) return;
    this.samples.push({ time, state, now });
    if (this.samples.length > 32) this.samples.shift();
    if (this.cursor === null) {
      this.cursor = time - this.delay;
      this.lastNow = now;
    }
  }
  sample(now) {
    if (!this.samples.length) return null;
    const last = this.samples.at(-1),
      dt = clamp(now - this.lastNow, 0, 0.1);
    this.lastNow = now;
    const wanted = last.time + Math.min(now - last.now, 0.15) - this.delay;
    if (Math.abs(wanted - this.cursor) > 0.5) this.cursor = wanted;
    else
      this.cursor +=
        dt * (1 + clamp((wanted - this.cursor - dt) * 2, -0.08, 0.08));
    let a = this.samples[0];
    if (this.cursor <= a.time) return { ...a.state };
    for (let i = 1; i < this.samples.length; i++) {
      const b = this.samples[i];
      if (b.time >= this.cursor)
        return interpolate(
          a.state,
          b.state,
          (this.cursor - a.time) / (b.time - a.time),
        );
      a = b;
    }
    // Briefly coast through a missing update, then stop rather than run away.
    const ahead = clamp(this.cursor - last.time, 0, 0.1);
    return {
      ...last.state,
      x: last.state.x + last.state.vx * ahead,
      y: last.state.y + last.state.vy * ahead,
      z: last.state.z + last.state.vz * ahead,
      wheelSpin: last.state.wheelSpin + (last.state.speed / 0.42) * ahead,
    };
  }
}
/** Fixed-step prediction with partial command acknowledgement and bounded replay. */
export class KartPrediction {
  constructor(actor, track) {
    this.actor = actor;
    this.track = track;
    this.history = [];
    this.ready = false;
    this.offset = {};
    this.lastRendered = null;
    this.lastSnapshot = -Infinity;
    this.teleport = null;
  }
  advance(input, seq, index) {
    if (!this.ready) return;
    this.previous = pose(this.actor);
    this.actor.update(
      STEP,
      { ...input, driftPressed: input.drift && !this.actor.lastDrift },
      this.track,
    );
    this.actor.lastDrift = input.drift;
    this.current = pose(this.actor);
    this.history.push({ input: { ...input }, seq, index });
    if (this.history.length > 120) this.history.shift();
  }
  reconcile(you, now) {
    const old = this.lastRendered ?? this.current;
    const hard =
      !this.ready ||
      this.teleport !== you.teleport ||
      now - this.lastSnapshot > 0.5;
    this.lastSnapshot = now;
    this.teleport = you.teleport;
    this.history = hard
      ? []
      : this.history.filter(
          (h) =>
            h.seq > you.ackSeq ||
            (h.seq === you.ackSeq && h.index > you.inputTicks),
        );
    restorePhysics(this.actor, you.physics);
    for (const h of this.history) {
      this.actor.update(
        STEP,
        { ...h.input, driftPressed: h.input.drift && !this.actor.lastDrift },
        this.track,
      );
      this.actor.lastDrift = h.input.drift;
    }
    this.current = pose(this.actor);
    this.previous = { ...this.current };
    this.ready = true;
    this.offset = {};
    if (!hard && old && distance(old, this.current) <= 6) {
      for (const k of continuous) this.offset[k] = old[k] - this.current[k];
      for (const k of ['yaw', 'visualYaw'])
        this.offset[k] = angle(this.current[k], old[k], 1) - this.current[k];
    }
  }

  render(alpha, dt) {
    if (!this.ready) return null;
    const value = interpolate(this.previous, this.current, clamp(alpha, 0, 1));
    const decay = Math.exp(-12 * dt);
    for (const [k, v] of Object.entries(this.offset)) {
      value[k] += v;
      this.offset[k] *= decay;
    }
    this.lastRendered = { ...value };
    return value;
  }
  state() {
    return capturePhysics(this.actor);
  }
}
