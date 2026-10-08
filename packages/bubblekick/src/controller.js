// Retain button edges until the game polls them. Native input can arrive more
// often than a render frame; replacing the latest state loses short presses.
const BUTTONS = [
  'confirm',
  'cancel',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'view',
  'menu',
  null,
  null,
  'up',
  'down',
  'left',
  'right',
  null,
];
const AXES = ['moveX', 'moveY', 'lookX', 'lookY'];
const value = (n, min = 0) => Math.max(min, Math.min(1, Number(n) || 0));
export function createController() {
  let seen = false,
    latest = { buttons: BUTTONS.map(() => 0), axes: [0, 0, 0, 0] },
    queue = [];
  const pad = {
    id: 'Backbone / Akeru controller',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: BUTTONS.map(() => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    vibrationActuator: null,
  };
  function update(controls) {
    const next = {
      buttons: BUTTONS.map((k) => (k ? value(controls?.buttons?.[k]) : 0)),
      axes: AXES.map((k) => value(controls?.axes?.[k], -1)),
    };
    if (
      next.buttons.some((v) => v > 0.25) ||
      next.axes.some((v) => Math.abs(v) > 0.25)
    )
      seen = true;
    if (next.buttons.some((v, i) => v > 0.5 !== latest.buttons[i] > 0.5)) {
      if (queue.length >= 32) queue = []; // bounded backlog, never replay unbounded input
      queue.push(next);
    }
    latest = next;
  }
  function read() {
    if (!seen) return [];
    const state = queue.shift() || latest;
    state.buttons.forEach((v, i) =>
      Object.assign(pad.buttons[i], {
        value: v,
        pressed: v > 0.5,
        touched: v > 0,
      }),
    );
    pad.axes.splice(0, 4, ...latest.axes);
    pad.timestamp = performance.now();
    return [pad];
  }
  function clear() {
    queue = [];
    latest = { buttons: BUTTONS.map(() => 0), axes: [0, 0, 0, 0] };
    pad.buttons.forEach((b) =>
      Object.assign(b, { pressed: false, touched: false, value: 0 }),
    );
    pad.axes.fill(0);
  }
  return { update, read, clear };
}
