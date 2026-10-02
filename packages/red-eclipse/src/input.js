const axis = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
export function mapInput(payload = {}) {
  const a = payload?.axes ?? {},
    b = payload?.buttons ?? {};
  const down = (key) => (axis(b[key]) > 0.5 ? 1 : 0);
  return {
    x: axis(a.moveX) || down('right') - down('left'),
    y: axis(a.moveY) || down('down') - down('up'),
    yaw: axis(a.lookX),
    pitch: axis(a.lookY),
    actions: [
      down('rightTrigger'),
      down('leftTrigger'),
      down('confirm'),
      down('west'),
      down('north'),
      down('cancel'),
      down('rightShoulder'),
      down('leftShoulder'),
    ],
  };
}
export function trustedMessage(event, host, nonce, source, sequence) {
  const m = event.data;
  return (
    event.source === source &&
    event.origin === host &&
    m?.protocol === 'akeru.catalog.v1' &&
    m.nonce === nonce &&
    Number.isSafeInteger(m.sequence) &&
    m.sequence > sequence
  );
}
