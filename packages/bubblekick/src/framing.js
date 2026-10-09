const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A sideline broadcast camera: the local player leads the framing, with a small
// amount of room toward the ball. It never zooms out to fit the entire stadium.
export function followCamera(state, localHumans, aspect) {
  const players = localHumans
    .map((id) => state.players[state.humans[id]?.player])
    .filter((p) => p && p.active !== false);
  const ball = state.ball;
  const field = state.field || { halfLength: 30, halfWidth: 19 };
  const count = players.length || 1;
  const focus = players.length
    ? players.reduce(
        (sum, p) => ({
          x: sum.x + p.x / count,
          z: sum.z + p.z / count,
          vx: sum.vx + p.vx / count,
          vz: sum.vz + p.vz / count,
        }),
        { x: 0, z: 0, vx: 0, vz: 0 },
      )
    : { ...ball, vx: 0, vz: 0 };
  const x = clamp(
    focus.x +
      clamp((ball.x - focus.x) * 0.15, -3, 3) +
      clamp(focus.vx * 0.15, -1.5, 1.5),
    -field.halfLength + 4,
    field.halfLength - 4,
  );
  const z = clamp(
    focus.z + clamp((ball.z - focus.z) * 0.12, -2, 2),
    -field.halfWidth + 1,
    field.halfWidth - 1,
  );
  const spread = players.reduce(
    (n, p) => Math.max(n, Math.hypot(p.x - focus.x, p.z - focus.z)),
    0,
  );
  const action = Math.max(
    spread,
    Math.hypot(ball.x - focus.x, ball.z - focus.z) * 0.35,
  );
  const distance =
    (35 + clamp((action - 10) * 0.25, 0, 5)) *
    Math.max(1, Math.sqrt(1.4 / Math.max(0.3, aspect)));
  return { x, z, distance, height: distance * 0.86, depth: distance * 0.9 };
}
