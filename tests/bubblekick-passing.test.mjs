import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passFlight } from '../packages/bubblekick/patches/pass-flight.mjs';
const tuning = { groundFriction: 0.9, airDrag: 0.12, gravity: 24 };
test('ground passes arrive quickly instead of stopping short under 60 Hz drag', () => {
  for (const distance of [5, 15, 25, 40, 60]) {
    const flight = passFlight({ ...tuning, distance, lob: false });
    let x = 0,
      v = flight.speed,
      t = 0;
    while (x < distance - 1 && t < 1.2) {
      v *= 1 - tuning.groundFriction / 60;
      x += v / 60;
      t += 1 / 60;
    }
    assert(x >= distance - 1, `${distance} pass stopped short`);
    assert(t < 1, `${distance} pass too slow: ${t}`);
    assert.equal(flight.verticalSpeed, 0);
  }
});
test('lob passes retain an arc and land near the chosen receiver', () => {
  for (const distance of [15, 30, 50]) {
    const f = passFlight({ ...tuning, distance, lob: true });
    let x = 0,
      y = 0,
      v = f.speed,
      vy = f.verticalSpeed,
      peak = 0;
    do {
      v *= 1 - tuning.airDrag / 60;
      vy -= tuning.gravity / 60;
      x += v / 60;
      y += vy / 60;
      peak = Math.max(peak, y);
    } while (y > 0);
    assert(peak > 0.7);
    assert(Math.abs(x - distance) < 3, `lob missed: ${x} vs ${distance}`);
  }
});
