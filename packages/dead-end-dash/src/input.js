/** Akeru's logical controls become the game's actions. The host owns the device,
 * its deadzone and the Menu button; this module never reads a gamepad. */
const clamp = (value, min) =>
  Number.isFinite(value) ? Math.max(min, Math.min(1, value)) : 0;
const namePattern = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const providers = ['gamepad', 'touch', 'native-input'];

export const idle = () => ({
  mx: 0,
  my: 0,
  held: {
    jump: 0,
    confirm: 0,
    back: 0,
    shove: 0,
    ping: 0,
    pause: 0,
    up: 0,
    down: 0,
    left: 0,
    right: 0,
  },
});

/** A (confirm) jumps, X/B/RT shove, Y/LB/RB ping, View opens the game's own
 * menu. Menu/Start never arrives as a game action: it opens Akeru's menu. */
export function mapControls({ buttons: b = {}, axes: a = {} } = {}) {
  const v = (name) => clamp(b[name], 0);
  let mx = clamp(a.moveX, -1),
    my = clamp(a.moveY, -1);
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  return {
    mx,
    my,
    held: {
      jump: v('confirm'),
      confirm: v('confirm'),
      back: v('cancel'),
      shove: Math.max(v('west'), v('cancel'), v('rightTrigger')),
      ping: Math.max(v('north'), v('leftShoulder'), v('rightShoulder')),
      pause: v('view'),
      up: v('up'),
      down: v('down'),
      left: v('left'),
      right: v('right'),
    },
  };
}

const record = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length <= 32 &&
  Object.entries(value).every(
    ([name, n]) => namePattern.test(name) && Number.isFinite(n),
  );

/** Only the authenticated channel calls this, but a payload is still data. */
export function validInput(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    providers.includes(payload.provider) &&
    typeof payload.connected === 'boolean' &&
    record(payload.buttons) &&
    record(payload.axes),
  );
}

// How long after play resumes a button that arrives already down is taken to
// have been held through the pause rather than pressed.
export const CARRY_MS = 150;

/** The provider the game reads instead of a controller or its own touch pad.
 * The host sends a snapshot only when something changes, so the last one
 * stands until the next, a pause, a disconnect or a hidden page.
 *
 * A button that is down in the first moments after one of those was held
 * through it (the A that chose Resume in the app's pill, say) and is ignored
 * until the host reports it released. Nothing is waited for otherwise: a host
 * that reports changes only may send nothing at all until the next press. */
export function createHostInput({
  rumble = () => {},
  now = () => performance.now(),
} = {}) {
  let state = idle(),
    connected = false,
    down = false,
    carryUntil = -Infinity;
  const carried = new Set();
  const provider = {
    // Everything the host forwards is sticks and buttons, whatever it calls
    // the source: its on-screen pad and the Backbone app's bridge both arrive
    // as `touch`. Naming it a controller keeps the game's menu highlight on;
    // a finger on the game's own menus is seen by the game directly.
    name: 'gamepad',
    get connected() {
      return connected;
    },
    // Set by the game: a button going down is when sound may start, and a
    // changed `connected` redraws its controller note.
    onPress: null,
    onChange: null,
    read(out) {
      out.mx = state.mx;
      out.my = state.my;
      let active = state.mx !== 0 || state.my !== 0;
      for (const [action, value] of Object.entries(state.held)) {
        out.held[action] = value;
        if (value >= 0.5) active = true;
      }
      return active;
    },
    // The game clears input when a dash starts or a menu closes. A stick that
    // is still held must keep working: the host will not send it again.
    reset() {},
    dispose() {
      state = idle();
      provider.onPress = provider.onChange = null;
    },
    // A request only: the host decides whether anything can or should shake.
    rumble(ms, strong) {
      const magnitude = clamp(strong, 0);
      rumble({
        duration: Math.max(1, Math.min(500, Math.round(ms) || 1)),
        strongMagnitude: magnitude,
        weakMagnitude: magnitude * 0.6,
      });
    },
    /** One `input` payload. Returns false, changing nothing, if malformed. */
    receive(payload) {
      if (!validInput(payload)) return false;
      state = payload.connected ? mapControls(payload) : idle();
      if (now() <= carryUntil)
        for (const [action, value] of Object.entries(state.held))
          if (value >= 0.5) carried.add(action);
      for (const action of [...carried])
        if (state.held[action] < 0.5) carried.delete(action);
        else state.held[action] = 0;
      const pressed = Object.values(state.held).some((value) => value >= 0.5);
      if (pressed && !down) provider.onPress?.();
      down = pressed;
      return true;
    },
    /** Host pause, a hidden page or a lost controller: nothing stays held. */
    neutral() {
      state = idle();
      down = false;
      carried.clear();
      carryUntil = now() + CARRY_MS;
    },
    setConnected(next) {
      if (typeof next !== 'boolean' || next === connected) return;
      connected = next;
      if (!next) provider.neutral();
      provider.onChange?.();
    },
  };
  return provider;
}

/** The lines of the game's How to Play table that differ inside Akeru. */
export const controlText = Object.freeze({
  pad: Object.freeze({
    pause: 'View (Menu opens Akeru)',
  }),
  touch: Object.freeze({
    move: 'Left stick or D-pad',
    jump: 'A',
    shove: 'X or B',
    ping: 'Y',
    pause: 'View',
    back: 'B',
  }),
});
