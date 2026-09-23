/** Framework services for the upstream rules; no browser storage or networking. */
export const batch = (fn) => fn();
export const ReactiveMap = Map;
export const ReactiveSet = Set;
export const produce = (fn) => fn;
export const reconcile = (value) => value;
export function createStore(initial) {
  return [
    initial,
    (key, value) => {
      if (typeof key === 'function') key(initial);
      else if (initial[key]) {
        // Solid reconcile preserves object identity: upstream selectTile retains
        // tile references while deletion and scoring update the same entities.
        for (const property of Object.keys(initial[key]))
          if (!Object.hasOwn(value, property)) delete initial[key][property];
        Object.assign(initial[key], value);
      } else initial[key] = value;
    },
  ];
}
export const indexBy = (items, key) =>
  Object.fromEntries(items.map((item) => [key(item), item]));
export const isIncludedIn = (value, items) => items.includes(value);
export function play() {}
export function animate() {}
export function captureEvent() {}
export const DELETED_DURATION = 0;
export default class Random {
  next() {
    return Math.random();
  }
}
