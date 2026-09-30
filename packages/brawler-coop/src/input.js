export function mapInput(payload = {}) {
  const axes = payload?.axes ?? {},
    b = payload?.buttons ?? {};
  const n = (v) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(-1, Math.min(1, v))
      : 0;
  const x = n(axes.moveX) || n(b.right) - n(b.left),
    y = n(axes.moveY) || n(b.down) - n(b.up);
  return {
    move_left: Math.max(0, -x),
    move_right: Math.max(0, x),
    move_up: Math.max(0, -y),
    move_down: Math.max(0, y),
    ui_left: Number(x < -0.45),
    ui_right: Number(x > 0.45),
    ui_up: Number(y < -0.45),
    ui_down: Number(y > 0.45),
    jump: Math.max(0, n(b.confirm)),
    attack: Math.max(0, n(b.west), n(b.rightTrigger)),
    ui_accept: Math.max(0, n(b.confirm)),
    ui_cancel: Math.max(0, n(b.cancel)),
  };
}
