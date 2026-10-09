// Pick a short arrival time, then compensate for the simulation's exponential
// drag. A fixed speed cap made longer passes run out of momentum before arrival.
export function passFlight({
  distance,
  lob,
  groundFriction,
  airDrag,
  gravity,
}) {
  const length = Math.max(0, distance);
  const duration = lob
    ? Math.max(0.55, Math.min(1.15, 0.28 + length / 55))
    : Math.max(0.24, Math.min(0.9, 0.16 + length / 60));
  const drag = lob ? airDrag : groundFriction;
  const speed = Math.max(
    20,
    drag > 0
      ? (length * drag) / -Math.expm1(-drag * duration)
      : length / duration,
  );
  return { speed, duration, verticalSpeed: lob ? gravity * duration * 0.5 : 0 };
}
