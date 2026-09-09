import { controlsNeutral, DEFAULT_MAPPINGS, GAMEPAD_BUTTONS, normalizeRawControls, readStandardGamepad, validateMapping } from './normalize.js';
import { defaultPreferences, loadPreferences, savePreferences } from './preferences.js';
import { createInputUi } from './overlay.js';

const clone = value => structuredClone(value);
const freezeRecord = value => Object.freeze({ ...value });
const freezeSnapshot = value => Object.freeze({ ...value, buttons: freezeRecord(value.buttons), axes: freezeRecord(value.axes) });
const navKeys = Object.freeze({
  ArrowUp: { type: 'move', direction: 'up' }, ArrowDown: { type: 'move', direction: 'down' },
  ArrowLeft: { type: 'move', direction: 'left' }, ArrowRight: { type: 'move', direction: 'right' },
  Enter: { type: 'activate' }, ' ': { type: 'activate' }, Escape: { type: 'back' }, m: { type: 'menu' }, M: { type: 'menu' },
});
const navRepeat = Object.freeze({ initialMs: 350, intervalMs: 120 });

function listenerSet(reportError) {
  const listeners = new Set();
  return {
    add(listener) {
      if (typeof listener !== 'function' || listeners.size >= 32) throw new TypeError('Invalid input listener');
      listeners.add(listener); return () => listeners.delete(listener);
    },
    emit(value) { for (const listener of [...listeners]) try { listener(value); } catch (error) { reportError(error); } },
    clear() { listeners.clear(); },
  };
}

function editableTarget(target) {
  const tag = target?.tagName?.toLowerCase?.();
  return target?.isContentEditable || ['input', 'textarea', 'select', 'button'].includes(tag);
}

export function createBrowserInputProvider(options = {}) {
  const window = options.window ?? globalThis.window;
  const document = options.document ?? globalThis.document;
  const navigator = options.navigator ?? globalThis.navigator;
  if (!window?.addEventListener || !document?.addEventListener) throw new TypeError('Browser event APIs are required');
  let storage = options.storage;
  if (storage === undefined) try { storage = window.localStorage; } catch { storage = null; }
  let preferences = loadPreferences(storage, options.titleId);
  if (options.deadzone !== undefined) preferences.deadzone = options.deadzone;
  if (options.selectedController !== undefined) preferences.selectedController = options.selectedController;
  if (options.mapping?.gamepad) preferences.mappings.gamepad = validateMapping('gamepad', options.mapping.gamepad);
  if (options.mapping?.touch) preferences.mappings.touch = validateMapping('touch', options.mapping.touch);
  preferences = savePreferences(null, options.titleId, preferences);
  const raf = options.requestAnimationFrame ?? window.requestAnimationFrame?.bind(window);
  const cancelRaf = options.cancelAnimationFrame ?? window.cancelAnimationFrame?.bind(window);
  let fallbackTime = 0;
  const now = options.now ?? (() => window.performance?.now?.() ?? globalThis.performance?.now?.() ?? fallbackTime++);
  if (typeof raf !== 'function' || typeof cancelRaf !== 'function') throw new TypeError('Animation frame APIs are required');

  const reportError = typeof options.onError === 'function' ? options.onError : error => globalThis.console?.error?.(error);
  const snapshots = listenerSet(reportError), navigation = listenerSet(reportError), removers = [];
  let started = false, disposed = false, focused = document.visibilityState !== 'hidden', frame = null, ui = null;
  let sequence = -1, lastTime = -1, activeProvider = null, activeGamepad = null, gamepadNeedsNeutral = true, lastSnapshotSignature = '';
  let connectedControllers = [], controllerSignature = '', navHeld = new Map(), gamepadStatus = typeof navigator?.getGamepads === 'function' ? 'available' : 'unavailable';
  const touchPointers = new Map();

  const time = () => { const value = Number(now()); lastTime = Math.max(lastTime, Number.isFinite(value) ? value : 0); return lastTime; };
  const persist = () => { preferences = savePreferences(storage, options.titleId, preferences); ui?.update(preferences, connectedControllers); };
  const emitSnapshot = (provider, connected, controls, force = false) => {
    if (!focused) return;
    if (activeProvider && activeProvider !== provider) release(activeProvider, true);
    const signature = JSON.stringify([provider, connected, controls.buttons, controls.axes]);
    if (!force && signature === lastSnapshotSignature) return;
    const snapshot = freezeSnapshot({ sequence: ++sequence, timeMs: time(), provider, connected, buttons: controls.buttons, axes: controls.axes });
    lastSnapshotSignature = signature;
    activeProvider = connected ? provider : null;
    snapshots.emit(snapshot);
  };
  const release = (provider = activeProvider, connected = true) => {
    if (!provider) return;
    const snapshot = freezeSnapshot({ sequence: ++sequence, timeMs: time(), provider, connected, buttons: {}, axes: {} });
    lastSnapshotSignature = JSON.stringify([provider, connected, {}, {}]);
    activeProvider = connected ? provider : null;
    snapshots.emit(snapshot);
  };
  const emitNavigation = event => navigation.emit(Object.freeze({ ...event }));
  const resetInput = () => {
    if (focused) release(activeProvider, true);
    activeProvider = null; lastSnapshotSignature = ''; touchPointers.clear(); gamepadNeedsNeutral = true; navHeld.clear();
  };
  const setFocused = next => {
    if (focused === next) return;
    if (!next) resetInput();
    focused = next;
    if (next) { gamepadNeedsNeutral = true; lastSnapshotSignature = ''; navHeld.clear(); }
  };

  const touchChanged = (phase, control, pointerId) => {
    if (!started || !focused) return;
    if (phase === 'start') touchPointers.set(pointerId, control);
    else if (touchPointers.get(pointerId) === control) touchPointers.delete(pointerId);
    else return;
    const raw = { buttons: Object.fromEntries(GAMEPAD_BUTTONS.map(name => [name, 0])), axes: {} };
    for (const name of touchPointers.values()) raw.buttons[name] = 1;
    emitSnapshot('touch', true, normalizeRawControls(raw, preferences.mappings.touch, preferences.deadzone), true);
  };

  const listGamepads = () => {
    if (typeof navigator?.getGamepads !== 'function') return [];
    try { gamepadStatus = 'available'; return Array.from(navigator.getGamepads() ?? []).filter(Boolean).filter(pad => pad.connected !== false && pad.mapping === 'standard'); }
    catch { gamepadStatus = 'unavailable'; return []; }
  };
  const gamepadNeutral = raw => controlsNeutral(raw, { axisThreshold: preferences.deadzone, buttonThreshold: 0.05 });
  const chooseGamepad = pads => {
    if (preferences.selectedController !== null) return pads.find(pad => pad.index === preferences.selectedController) ?? null;
    const current = pads.find(pad => pad.index === activeGamepad);
    const engaged = pads.find(pad => { const raw = readStandardGamepad(pad); return raw && !gamepadNeutral(raw); });
    if (engaged && (!current || gamepadNeutral(readStandardGamepad(current)))) return engaged;
    return current ?? engaged ?? pads[0] ?? null;
  };
  const updateControllerList = pads => {
    const next = pads.map(pad => Object.freeze({ index: pad.index, mapping: 'standard' })).sort((a, b) => a.index - b.index);
    const signature = JSON.stringify(next);
    if (signature !== controllerSignature) { controllerSignature = signature; connectedControllers = next; ui?.update(preferences, connectedControllers); }
  };
  const gamepadNavigation = (controls, at) => {
    const pressed = {
      up: (controls.buttons.up ?? 0) > 0.5 || (controls.axes.moveY ?? 0) < -0.6,
      down: (controls.buttons.down ?? 0) > 0.5 || (controls.axes.moveY ?? 0) > 0.6,
      left: (controls.buttons.left ?? 0) > 0.5 || (controls.axes.moveX ?? 0) < -0.6,
      right: (controls.buttons.right ?? 0) > 0.5 || (controls.axes.moveX ?? 0) > 0.6,
      activate: (controls.buttons.confirm ?? 0) > 0.5,
      back: (controls.buttons.cancel ?? 0) > 0.5,
      menu: (controls.buttons.menu ?? 0) > 0.5,
    };
    for (const [action, down] of Object.entries(pressed)) {
      const held = navHeld.get(action);
      if (!down) { navHeld.delete(action); continue; }
      if (!held) {
        navHeld.set(action, { started: at, last: at });
        emitNavigation(['up', 'down', 'left', 'right'].includes(action) ? { type: 'move', direction: action } : { type: action });
      } else if (['up', 'down', 'left', 'right'].includes(action) && at - held.started >= navRepeat.initialMs && at - held.last >= navRepeat.intervalMs) {
        held.last = at; emitNavigation({ type: 'move', direction: action });
      }
    }
  };
  const poll = () => {
    if (!started) return;
    const pads = listGamepads(); updateControllerList(pads);
    const selected = chooseGamepad(pads);
    if (!selected) {
      if (activeGamepad !== null) { if (activeProvider === 'gamepad') release('gamepad', false); activeGamepad = null; gamepadNeedsNeutral = true; navHeld.clear(); }
    } else {
      const raw = readStandardGamepad(selected);
      if (selected.index !== activeGamepad) {
        if (activeProvider === 'gamepad') release('gamepad', false);
        activeGamepad = selected.index; gamepadNeedsNeutral = true; lastSnapshotSignature = ''; navHeld.clear();
      }
      if (focused && raw) {
        if (gamepadNeedsNeutral) {
          if (gamepadNeutral(raw)) {
            gamepadNeedsNeutral = false;
            if (ui && activeProvider === 'gamepad') emitSnapshot('gamepad', true, normalizeRawControls(raw, preferences.mappings.gamepad, preferences.deadzone), true);
          }
        } else {
          const controls = normalizeRawControls(raw, preferences.mappings.gamepad, preferences.deadzone);
          if (ui) {
            if (activeProvider === 'gamepad' || !gamepadNeutral(raw)) emitSnapshot('gamepad', true, controls);
          } else gamepadNavigation(controls, time());
        }
      }
    }
    frame = raf(poll);
  };

  const keydown = event => {
    if (!focused || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || editableTarget(event.target)) return;
    const navigationEvent = navKeys[event.key];
    if (!navigationEvent) return;
    event.preventDefault(); emitNavigation(navigationEvent);
  };
  const add = (target, type, listener) => { target.addEventListener(type, listener); removers.push(() => target.removeEventListener(type, listener)); };

  const api = {
    mount({ touchRoot, controlsRoot } = {}) {
      if (disposed || ui) throw new Error(disposed ? 'Input provider disposed' : 'Input provider already mounted');
      resetInput();
      ui = createInputUi({ document, touchRoot, controlsRoot, preferences, onTouch: touchChanged,
        onDeadzone: value => api.setDeadzone(value), onController: value => api.selectController(value),
        onGamepadMapping: value => api.setMapping('gamepad', value), onReset: () => api.resetPreferences(),
      });
      ui.update(preferences, connectedControllers);
      let mounted = true;
      return () => { if (!mounted) return; mounted = false; resetInput(); ui?.unmount(); ui = null; };
    },
    start() {
      if (disposed) throw new Error('Input provider disposed');
      if (started) return;
      started = true;
      add(window, 'keydown', keydown);
      add(window, 'blur', () => setFocused(false)); add(window, 'focus', () => setFocused(document.visibilityState !== 'hidden'));
      add(document, 'visibilitychange', () => setFocused(document.visibilityState !== 'hidden'));
      add(window, 'gamepaddisconnected', () => { gamepadNeedsNeutral = true; });
      frame = raf(poll);
    },
    stop() {
      if (!started) return;
      resetInput(); started = false;
      if (frame !== null) cancelRaf(frame); frame = null;
      for (const remove of removers.splice(0)) remove();
    },
    subscribe(listener) { if (disposed) throw new Error('Input provider disposed'); return snapshots.add(listener); },
    subscribeNavigation(listener) { if (disposed) throw new Error('Input provider disposed'); return navigation.add(listener); },
    setDeadzone(value) {
      if (!Number.isFinite(value) || value < 0 || value > 0.5) throw new TypeError('Invalid deadzone');
      resetInput(); preferences.deadzone = value; persist();
    },
    setMapping(provider, value) {
      const mapping = validateMapping(provider, value); resetInput(); preferences.mappings[provider] = mapping; persist();
    },
    selectController(index) {
      if (index !== null && (!Number.isSafeInteger(index) || index < 0 || index > 15)) throw new TypeError('Invalid controller index');
      resetInput(); activeGamepad = null; preferences.selectedController = index; persist();
    },
    resetPreferences() { resetInput(); preferences = defaultPreferences(); persist(); },
    refreshControllers() {
      if (disposed) throw new Error('Input provider disposed');
      updateControllerList(listGamepads());
      return Object.freeze(connectedControllers.slice());
    },
    getPreferences() { return clone(preferences); },
    getState() { return Object.freeze({ started, mounted: !!ui, focused, gamepad: gamepadStatus, activeProvider, activeController: activeGamepad, controllers: Object.freeze(connectedControllers.slice()) }); },
    showControls() { ui?.show(); }, hideControls() { ui?.hide(); },
    dispose() {
      if (disposed) return;
      api.stop(); ui?.unmount(); ui = null; snapshots.clear(); navigation.clear(); disposed = true;
    },
  };
  return Object.freeze(api);
}

export { DEFAULT_MAPPINGS, GAMEPAD_AXES, GAMEPAD_BUTTONS, LOGICAL_AXES, LOGICAL_BUTTONS, applyDeadzone, normalizeRawControls, readStandardGamepad, validateMapping } from './normalize.js';
export { defaultPreferences, loadPreferences, preferenceKey, savePreferences, validatePreferences } from './preferences.js';
