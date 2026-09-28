/** Exact physics state for reconciliation; race progress remains server-owned. */
export const STEP = 1 / 60;
const numbers = [
  'yaw',
  'visualYaw',
  'pitch',
  'roll',
  'vy',
  'airTime',
  'speed',
  'lateral',
  'driftDir',
  'driftCharge',
  'driftTier',
  '_counterT',
  'hopTimer',
  'boostTime',
  'boostPower',
  'spinTime',
  'squashTime',
  'stunTime',
  'invulnTime',
  'shrinkTime',
  'slipTime',
  'starTime',
  'chargedStart',
  'respawnTimer',
  '_lastGoodLat',
  'trackIndex',
  'progress',
  'wheelSpin',
  'steerVisual',
  'groundY',
  'wallHit',
  '_pinned',
];
const flags = [
  'grounded',
  'drifting',
  '_hopSteerLatch',
  '_driftWanted',
  'offroad',
  'stuck',
  'lastDrift',
];
export function capturePhysics(kart) {
  const value = {};
  for (const key of numbers)
    value[key] = Number.isFinite(kart[key]) ? kart[key] : 0;
  for (const key of flags) value[key] = !!kart[key];
  value.position = kart.position.toArray();
  value.velocity = kart.velocity.toArray();
  value.normal = kart._surfaceNormal.toArray();
  value.suspension = [...kart.suspension];
  return value;
}
export function restorePhysics(kart, value) {
  for (const key of [...numbers, ...flags]) kart[key] = value[key];
  kart.position.fromArray(value.position);
  kart.velocity.fromArray(value.velocity);
  kart._surfaceNormal.fromArray(value.normal);
  kart.suspension = [...value.suspension];
}
export function pose(kart) {
  return {
    x: kart.position.x,
    y: kart.position.y,
    z: kart.position.z,
    vx: kart.velocity.x,
    vy: kart.vy,
    vz: kart.velocity.z,
    yaw: kart.yaw,
    visualYaw: kart.visualYaw,
    pitch: kart.pitch,
    roll: kart.roll,
    steerVisual: kart.steerVisual,
    wheelSpin: kart.wheelSpin,
    speed: kart.speed,
    nx: kart._surfaceNormal.x,
    ny: kart._surfaceNormal.y,
    nz: kart._surfaceNormal.z,
    grounded: kart.grounded,
    drifting: kart.drifting,
    driftDir: kart.driftDir,
    driftTier: kart.driftTier,
    boostTime: kart.boostTime,
    suspension: [...kart.suspension],
  };
}
