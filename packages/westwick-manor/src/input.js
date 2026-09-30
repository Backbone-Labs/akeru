export const idle = {
  mx: 0,
  my: 0,
  aimX: 0,
  aimY: 0,
  attack: false,
  ability: false,
  dash: false,
  interact: false,
  use: false,
  slot: null,
  ready: false,
};
export function input(keyboard, { buttons: b = {}, axes: a = {} } = {}, game) {
  const down = (k) => b[k] > 0.5;
  let mx = a.moveX || (b.right || 0) - (b.left || 0) || keyboard.mx,
    my = a.moveY || (b.down || 0) - (b.up || 0) || keyboard.my;
  const n = Math.hypot(mx, my);
  if (n > 1) {
    mx /= n;
    my /= n;
  }
  const me = game?.me();
  const looking = Math.hypot(a.lookX || 0, a.lookY || 0) > 0.15;
  if (looking) game.akeruAim = { x: a.lookX, y: a.lookY };
  else if (n > 0.15 && !game.akeruAim) game.akeruAim = { x: mx, y: my };
  const aim = game?.akeruAim;
  return {
    ...keyboard,
    mx,
    my,
    ...(me && aim ? { aimX: me.x + aim.x * 8, aimY: me.y + aim.y * 8 } : {}),
    attack: keyboard.attack || down('rightTrigger') || down('west'),
    ability: keyboard.ability || down('leftTrigger'),
    dash: keyboard.dash || down('cancel'),
    interact: keyboard.interact || down('confirm'),
    ready: keyboard.ready || down('confirm'),
    use: keyboard.use || down('north'),
    slot: keyboard.slot,
  };
}
