import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserInputProvider } from '@akeru/input';

class FakeTarget {
  listeners = new Map();
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    event.target ??= this; event.defaultPrevented ??= false;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }
}

class FakeElement extends FakeTarget {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.value = ''; }
  setAttribute(name, value) {
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    else this[name] = String(value);
  }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  replaceChildren(...children) { this.children = []; for (const child of children) this.appendChild(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
}

class FakeDocument extends FakeTarget {
  visibilityState = 'visible';
  createElement(tag) { return new FakeElement(tag); }
}

class Frames {
  callbacks = new Map(); next = 1;
  request = callback => { const id = this.next++; this.callbacks.set(id, callback); return id; };
  cancel = id => this.callbacks.delete(id);
  step() { const callbacks = [...this.callbacks.values()]; this.callbacks.clear(); for (const callback of callbacks) callback(); }
}

const button = (value = 0) => ({ value });
function gamepad(index, { buttons = {}, axes = {} } = {}) {
  const values = Array.from({ length: 17 }, () => button());
  const buttonIndexes = { south: 0, east: 1, start: 9, dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15 };
  for (const [name, value] of Object.entries(buttons)) values[buttonIndexes[name]] = button(value);
  const axisValues = [0, 0, 0, 0];
  for (const [name, value] of Object.entries(axes)) axisValues[{ leftX: 0, leftY: 1, rightX: 2, rightY: 3 }[name]] = value;
  return { index, connected: true, mapping: 'standard', buttons: values, axes: axisValues };
}

function environment({ pads = [], storage, now = { value: 0 } } = {}) {
  const window = new FakeTarget(), document = new FakeDocument(), frames = new Frames();
  window.localStorage = storage ?? { getItem: () => null, setItem() {} };
  return { window, document, frames, now, navigator: { getGamepads: () => pads }, roots: { touchRoot: new FakeElement('div'), controlsRoot: new FakeElement('div') } };
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

test('mandatory touch supports capture, cancel and focus release while idle pads stay inactive', () => {
  const idle = gamepad(0), env = environment({ pads: [idle] });
  const provider = createBrowserInputProvider({ titleId: 'touch-title', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel, now: () => ++env.now.value });
  assert.throws(() => provider.mount({}), /touch root/i);
  provider.mount(env.roots); const seen = [], navigation = []; provider.subscribe(value => seen.push(value)); provider.subscribeNavigation(value => navigation.push(value));
  const confirm = descendants(env.roots.touchRoot).find(node => node.dataset.control === 'south');
  confirm.dispatch('pointerdown', { pointerId: 3 }); assert.equal(seen.length, 0, 'mounted controls remain inactive until start');
  provider.start();
  const down = confirm.dispatch('pointerdown', { pointerId: 4 });
  assert.equal(down.defaultPrevented, true); assert.equal(confirm.capturedPointer, 4);
  assert.equal(seen.at(-1).buttons.confirm, 1); assert.ok(Object.isFrozen(seen.at(-1).buttons));
  const count = seen.length; env.frames.step(); env.frames.step();
  assert.equal(seen.length, count, 'an idle controller must not release held touch');
  assert.equal(navigation.length, 0, 'mounted gameplay never emits controller navigation');
  confirm.dispatch('pointercancel', { pointerId: 4 }); assert.equal(seen.at(-1).buttons.confirm, 0);
  confirm.dispatch('pointerdown', { pointerId: 5 }); env.window.dispatch('blur');
  assert.deepEqual(seen.at(-1).buttons, {});
  env.window.dispatch('focus'); env.frames.step(); assert.notEqual(seen.at(-1).buttons.confirm, 1);
  provider.stop(); const stopped = seen.length; confirm.dispatch('pointerdown', { pointerId: 6 }); assert.equal(seen.length, stopped);
  provider.dispose(); provider.dispose(); assert.equal(env.roots.touchRoot.children.length, 0);
});

test('multiple controllers select active input and reconnect only after neutral', () => {
  const pads = [gamepad(0), gamepad(1)], env = environment({ pads });
  const provider = createBrowserInputProvider({ titleId: 'pad-title', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel, now: () => ++env.now.value });
  provider.mount(env.roots); const seen = []; provider.subscribe(value => seen.push(value)); provider.start(); env.frames.step();
  pads[1] = gamepad(1, { buttons: { south: 1 } }); env.frames.step();
  assert.equal(seen.length, 0, 'selection-time held input is gated');
  pads[1] = gamepad(1, { axes: { leftX: 0.1 } }); env.frames.step();
  pads[1] = gamepad(1, { buttons: { south: 1 } }); env.frames.step();
  assert.equal(provider.getState().activeController, 1); assert.equal(seen.at(-1).buttons.confirm, 1);
  pads.length = 1; env.frames.step();
  assert.equal(seen.at(-1).connected, false);
  pads[1] = gamepad(1, { buttons: { south: 1 } }); provider.selectController(1); env.frames.step();
  assert.equal(seen.at(-1).connected, false, 'held reconnect does not replay');
  pads[1] = gamepad(1, { axes: { leftX: 0.1 } }); env.frames.step();
  pads[1] = gamepad(1, { buttons: { south: 1 } }); env.frames.step();
  assert.equal(seen.at(-1).buttons.confirm, 1);
  provider.dispose();
});

test('catalog gamepad navigation uses edges and bounded directional repeat', () => {
  const pads = [gamepad(0)], clock = { value: 0 }, env = environment({ pads, now: clock });
  const provider = createBrowserInputProvider({ titleId: 'catalog', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel, now: () => clock.value });
  const navigation = []; provider.subscribeNavigation(value => navigation.push(value)); provider.start(); env.frames.step();
  clock.value = 10; pads[0] = gamepad(0, { buttons: { dpadRight: 1, south: 1 } }); env.frames.step();
  assert.deepEqual(navigation, [{ type: 'move', direction: 'right' }, { type: 'activate' }]);
  clock.value = 300; env.frames.step(); assert.equal(navigation.length, 2);
  clock.value = 370; env.frames.step(); assert.deepEqual(navigation.at(-1), { type: 'move', direction: 'right' });
  clock.value = 500; env.frames.step(); assert.equal(navigation.filter(event => event.type === 'activate').length, 1);
  provider.dispose();
});

test('keyboard navigation is shell-only and ignores edits and modifier chords', () => {
  const env = environment();
  const provider = createBrowserInputProvider({ titleId: 'catalog', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel });
  const navigation = [], snapshots = []; provider.subscribeNavigation(value => navigation.push(value)); provider.subscribe(value => snapshots.push(value)); provider.start();
  const handled = env.window.dispatch('keydown', { key: 'ArrowDown', target: new FakeElement('div') });
  env.window.dispatch('keydown', { key: 'Enter', target: new FakeElement('input') });
  env.window.dispatch('keydown', { key: 'm', metaKey: true, target: new FakeElement('div') });
  assert.equal(handled.defaultPrevented, true); assert.deepEqual(navigation, [{ type: 'move', direction: 'down' }]); assert.equal(snapshots.length, 0);
  provider.dispose();
});

test('restricted storage and gamepad APIs degrade to usable touch and keyboard', () => {
  const env = environment();
  Object.defineProperty(env.window, 'localStorage', { get() { throw new Error('denied'); } });
  env.navigator.getGamepads = () => { throw new Error('denied'); };
  const provider = createBrowserInputProvider({ titleId: 'restricted-title', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel });
  provider.mount(env.roots); const seen = []; provider.subscribe(value => seen.push(value)); provider.start(); env.frames.step();
  assert.equal(provider.getState().gamepad, 'unavailable');
  const confirm = descendants(env.roots.touchRoot).find(node => node.dataset.control === 'south');
  confirm.dispatch('pointerdown', { pointerId: 1 }); assert.equal(seen.at(-1).buttons.confirm, 1);
  assert.doesNotThrow(() => provider.setDeadzone(0.2));
  provider.dispose();
});

test('preferences persist only in their validated title scope', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const env = environment({ storage });
  const create = titleId => createBrowserInputProvider({ titleId, window: env.window, document: env.document, navigator: env.navigator, storage, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel });
  const one = create('one'); one.setDeadzone(0.3); one.setMapping('gamepad', { buttons: { south: 'fire' }, axes: { leftX: 'steer' } }); one.selectController(2); one.dispose();
  const reloaded = create('one'), other = create('two');
  assert.equal(reloaded.getPreferences().deadzone, 0.3); assert.equal(reloaded.getPreferences().selectedController, 2); assert.equal(reloaded.getPreferences().mappings.gamepad.buttons.south, 'fire');
  assert.equal(other.getPreferences().deadzone, 0.15);
  reloaded.dispose(); other.dispose();
});

test('generic controls overlay remaps baseline actions without dropping title actions', () => {
  const env = environment();
  const provider = createBrowserInputProvider({ titleId: 'custom-actions', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel,
    mapping: { gamepad: { buttons: { south: 'fire' }, axes: { leftX: 'steer' } } },
  });
  provider.mount(env.roots);
  const confirm = descendants(env.roots.controlsRoot).find(node => node.dataset.action === 'confirm');
  confirm.value = 'east'; confirm.dispatch('change');
  const mapping = provider.getPreferences().mappings.gamepad;
  assert.equal(mapping.buttons.south, 'fire'); assert.equal(mapping.buttons.east, 'confirm'); assert.equal(mapping.axes.leftX, 'steer');
  provider.dispose();
});

test('stopped controls can refresh hotplug state without input or navigation', () => {
  const pads = [gamepad(0)], env = environment({ pads });
  const provider = createBrowserInputProvider({ titleId: 'hotplug-title', window: env.window, document: env.document, navigator: env.navigator, requestAnimationFrame: env.frames.request, cancelAnimationFrame: env.frames.cancel });
  provider.mount(env.roots); const snapshots = [], navigation = [];
  provider.subscribe(value => snapshots.push(value)); provider.subscribeNavigation(value => navigation.push(value));
  provider.start(); env.frames.step(); provider.stop();
  const snapshotCount = snapshots.length;
  pads.push(gamepad(2));
  assert.deepEqual(provider.refreshControllers().map(controller => controller.index), [0, 2]);
  assert.deepEqual(provider.getState().controllers.map(controller => controller.index), [0, 2]);
  assert.equal(snapshots.length, snapshotCount); assert.equal(navigation.length, 0);
  pads.splice(0, 1);
  assert.deepEqual(provider.refreshControllers().map(controller => controller.index), [2]);
  assert.equal(snapshots.length, snapshotCount); assert.equal(navigation.length, 0);
  provider.dispose(); assert.throws(() => provider.refreshControllers(), /disposed/);
});
