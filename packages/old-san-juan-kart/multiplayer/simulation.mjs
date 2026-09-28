import { Track } from '../../../dist/kart-server/track.js';
import { Kart } from '../../../dist/kart-server/kart.js';
import { Race } from '../../../dist/kart-server/race.js';
import { CHARACTERS } from '../../../dist/kart-server/characters.js';
import { neutral } from './protocol.js';
export const STEP = 1 / 60;
// Shared immutable sample table; no canvas, scene construction or WebGL on workers.
const track = new Track();
export class KartSimulation {
  constructor(players) {
    this.karts = players.map((p, i) => {
      const k = new Kart(null, CHARACTERS[p.slot], { index: i, name: p.name });
      k.id = p.id;
      k.nextGate = 0;
      k.gates = 0;
      k.dnf = false;
      k.lastDrift = false;
      return k;
    });
    this.race = new Race(track, this.karts, { laps: 3 });
    this.race.state = 'countdown';
    this.countdown = 4;
    this.time = 0;
    this.finishDeadline = 600;
    this.done = false;
  }
  step(inputs) {
    if (this.done) return;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - STEP);
      return;
    }
    this.race.state = 'racing';
    this.time += STEP;
    this.race.raceTime = this.time;
    for (const k of this.karts) {
      if (k.finished) continue;
      const input = inputs.get(k.id) ?? neutral();
      const before = k.progress;
      k.update(
        STEP,
        { ...input, driftPressed: input.drift && !k.lastDrift },
        track,
      );
      k.lastDrift = input.drift;
      const distance = (k.progress - before + 1) % 1;
      const toGate = (k.nextGate / 32 - before + 1) % 1;
      // Ordered checkpoints. Only the server's physics can advance a lap.
      if (distance > 0 && distance < 0.03 && toGate <= distance) {
        if (k.nextGate === 0 && k.gates >= 32) {
          k.lap++;
          k.gates = 0;
          if (k.lap >= 3) {
            k.finished = true;
            k.finishTime = this.time;
            this.finishDeadline = Math.min(this.finishDeadline, this.time + 30);
          }
        }
        k.gates++;
        k.nextGate = (k.nextGate + 1) % 32;
      }
      k.progressTotal = k.lap + (k.gates === 0 ? -1 : k.progress);
      if (k.stuck || k.position.y < -30) this.race.respawn(k);
    }
    if (this.time >= this.finishDeadline) {
      for (const k of this.karts)
        if (!k.finished) {
          k.finished = true;
          k.dnf = true;
        }
    }
    this.race.updateRanks();
    this.done = this.karts.every((k) => k.finished);
  }
  retire(id) {
    const k = this.karts.find((k) => k.id === id);
    if (k && !k.finished) {
      k.finished = true;
      k.dnf = true;
    }
  }
  snapshot() {
    const ranked = [...this.karts].sort(
      (a, b) =>
        Number(a.dnf) - Number(b.dnf) ||
        (a.finished && b.finished
          ? a.finishTime - b.finishTime
          : Number(b.finished) - Number(a.finished) ||
            b.progressTotal - a.progressTotal),
    );
    return this.karts.map((k) => ({
      id: k.id,
      x: k.position.x,
      y: k.position.y,
      z: k.position.z,
      yaw: k.yaw,
      visualYaw: k.visualYaw,
      speed: k.speed,
      roll: k.roll,
      pitch: k.pitch,
      steerVisual: k.steerVisual,
      grounded: k.grounded,
      drifting: k.drifting,
      driftDir: k.driftDir,
      driftTier: k.driftTier,
      boostTime: k.boostTime,
      wheelSpin: k.wheelSpin,
      nx: k._surfaceNormal.x,
      ny: k._surfaceNormal.y,
      nz: k._surfaceNormal.z,
      lap: k.lap,
      rank: ranked.indexOf(k) + 1,
      progress: k.progress,
      finished: k.finished,
      finishTime: k.finishTime,
      dnf: k.dnf,
    }));
  }
}
