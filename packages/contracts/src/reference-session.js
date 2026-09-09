/** Browser-compatible executable contract model, not production persistence. */
const SDK_VERSION = '0.1.0';
const fail = message => { throw new Error(message); };
const clone = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
const slotValid = slot => typeof slot === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(slot);
const nameValid = name => typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(name);
const providers = ['gamepad', 'touch', 'native-input'];
const syncStates = ['disabled', 'signed-out', 'pending', 'synced', 'conflict', 'error'];

function checkHelp(help) {
  if (!exact(help, ['controller', 'touch'])) fail('Invalid control help');
  for (const kind of ['controller', 'touch']) {
    if (!Array.isArray(help[kind]) || help[kind].length < 1 || help[kind].length > 32) fail('Invalid control help');
    for (const item of help[kind]) {
      if (!exact(item, ['action', 'label']) || !nameValid(item.action) || typeof item.label !== 'string' || item.label.length < 1 || item.label.length > 80) fail('Invalid control help');
    }
  }
}

/** Fail closed before calling untrusted JavaScript that only structurally resembles an adapter. */
export function assertTitleAdapterV1(adapter) {
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) fail('Invalid title adapter');
  checkHelp(adapter.controlHelp);
  for (const method of ['initialize', 'pause', 'resume', 'dispose']) if (typeof adapter[method] !== 'function') fail(`Missing adapter capability: ${method}`);
  return adapter;
}

function checkControls(values, min, connected) {
  return values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).length <= 32 && Object.entries(values).every(([key, value]) => nameValid(key) && Number.isFinite(value) && value >= min && value <= 1 && (connected || value === 0));
}

function checkMapping(value) {
  if (!exact(value, ['buttons', 'axes'])) fail('Invalid input mapping');
  for (const kind of ['buttons', 'axes']) {
    const entries = Object.entries(value[kind] ?? {});
    if (!exact(value[kind], entries.map(([key]) => key)) || entries.length > 32 || entries.some(([from, to]) => !nameValid(from) || !nameValid(to)) || new Set(entries.map(([, to]) => to)).size !== entries.length) fail('Invalid input mapping');
  }
  return clone(value);
}

function mapControls(values, mapping, deadzone, axes) {
  const mapped = {};
  for (const [source, target] of Object.entries(mapping)) {
    if (!(source in values)) continue;
    const value = axes && Math.abs(values[source]) <= deadzone ? 0 : axes ? Math.sign(values[source]) * (Math.abs(values[source]) - deadzone) / (1 - deadzone) : values[source];
    mapped[target] = Object.is(value, -0) ? 0 : value;
  }
  return mapped;
}

function checkPresentation(value) {
  if (!exact(value, ['mode', 'orientation', 'safeArea']) || !['embedded', 'fullscreen'].includes(value.mode) || !['portrait', 'landscape'].includes(value.orientation) || !exact(value.safeArea, ['top', 'right', 'bottom', 'left']) || ['top', 'right', 'bottom', 'left'].some(side => !Object.hasOwn(value.safeArea, side)) || Object.values(value.safeArea).some(n => !Number.isFinite(n) || n < 0 || n > 4096)) fail('Invalid presentation state');
  return clone(value);
}

function checkAudio(value) {
  if (!exact(value, ['state', 'reason']) || !['blocked', 'ready', 'interrupted'].includes(value.state) || !['consent-required', 'background', 'route-change', null].includes(value.reason) || (value.state === 'ready' && value.reason !== null) || (value.state === 'blocked' && value.reason !== 'consent-required') || (value.state === 'interrupted' && !['background', 'route-change'].includes(value.reason))) fail('Invalid audio state');
  return clone(value);
}

/** One instance per trusted title + guest/account identity. Never accept identity from game messages. */
export function createReferenceHost({
  schemaVersion = 1,
  maxBytes = 65536,
  maxSlots = 8,
  inputDeadzone = 0.15,
  inputMapping = { buttons: { south: 'confirm' }, axes: { leftX: 'moveX', leftY: 'moveY' } },
  initialSaves = [],
} = {}) {
  if (![schemaVersion, maxBytes, maxSlots].every(n => Number.isSafeInteger(n) && n > 0) || maxBytes > 16777216 || maxSlots > 128) fail('Invalid host save limits');
  if (!Number.isFinite(inputDeadzone) || inputDeadzone < 0 || inputDeadzone >= 1) fail('Invalid input deadzone');
  let mapping = checkMapping(inputMapping);
  let state = 'created', sequence = -1, time = -1, revision = 0, disposed = false, focused = true, activeProvider = null;
  let saveAvailability = { local: 'available', sync: 'disabled' };
  let presentationState = checkPresentation({ mode: 'embedded', orientation: 'landscape', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
  let audioState = checkAudio({ state: 'blocked', reason: 'consent-required' });
  const records = new Map(), listeners = new Set(), presentationListeners = new Set(), audioListeners = new Set(), events = [];
  const live = () => { if (disposed || state === 'exit' || state === 'fatal') fail('Session ended'); };
  const checkSlot = slot => { live(); if (!slotValid(slot)) fail('Invalid slot'); };
  const quota = () => ({ usedSlots: records.size, maxSlots, usedBytes: [...records.values()].reduce((sum, record) => sum + record.bytes.byteLength, 0), maxBytesPerSlot: maxBytes });
  const validateSave = (value, expectedSchema = schemaVersion) => {
    if (!exact(value, ['schemaVersion', 'bytes']) || value.schemaVersion !== expectedSchema || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength > maxBytes) fail('Invalid save');
  };
  for (const seed of initialSaves) {
    if (!exact(seed, ['slot', 'schemaVersion', 'bytes']) || !slotValid(seed.slot) || !Number.isSafeInteger(seed.schemaVersion) || seed.schemaVersion < 1 || seed.schemaVersion > schemaVersion || !(seed.bytes instanceof Uint8Array) || seed.bytes.byteLength > maxBytes || records.has(seed.slot) || records.size >= maxSlots) fail('Invalid initial saves');
    records.set(seed.slot, { schemaVersion: seed.schemaVersion, bytes: new Uint8Array(seed.bytes), revision: String(++revision) });
  }
  const saves = Object.freeze({
    async read(slot) { checkSlot(slot); return clone(records.get(slot) ?? null); },
    async write(slot, value, expectedRevision) {
      checkSlot(slot); validateSave(value);
      if (saveAvailability.local !== 'available') fail('Local saves unavailable');
      const previous = records.get(slot);
      if ((previous?.revision ?? null) !== expectedRevision) fail('Revision conflict');
      if (!previous && records.size >= maxSlots) fail('Slot quota exceeded');
      const record = { schemaVersion, bytes: new Uint8Array(value.bytes), revision: String(++revision) };
      records.set(slot, record); return clone(record);
    },
    async remove(slot, expectedRevision) { checkSlot(slot); if (!records.has(slot) || records.get(slot).revision !== expectedRevision) fail('Revision conflict'); records.delete(slot); },
    async status() { live(); return clone({ ...saveAvailability, quota: quota() }); },
  });
  function emit(event) {
    live();
    const shapes = { loading: ['type', 'progress'], playable: ['type'], paused: ['type'], resumed: ['type'], exit: ['type'], fatal: ['type', 'code', 'message'], roundEnd: ['type', 'result'] };
    if (!exact(event, shapes[event?.type] ?? []) || !shapes[event.type]) fail('Invalid lifecycle event');
    if (event.type === 'loading' && event.progress !== undefined && (!Number.isFinite(event.progress) || event.progress < 0 || event.progress > 1)) fail('Invalid progress');
    if (event.type === 'fatal' && (typeof event.code !== 'string' || event.code.length < 1 || event.code.length > 64 || typeof event.message !== 'string' || event.message.length < 1 || event.message.length > 256)) fail('Invalid fatal event');
    if (event.type === 'roundEnd' && event.result !== undefined && !['completed', 'failed'].includes(event.result)) fail('Invalid round result');
    const allowed = { created: ['loading', 'fatal', 'exit'], loading: ['loading', 'playable', 'fatal', 'exit'], playable: ['paused', 'roundEnd', 'fatal', 'exit'], paused: ['resumed', 'fatal', 'exit'] };
    if (!allowed[state]?.includes(event.type)) fail('Invalid lifecycle transition');
    state = event.type === 'resumed' || event.type === 'roundEnd' ? 'playable' : event.type;
    events.push(clone(event));
    if (events.length > 128) events.shift();
  }
  function publish(input) {
    sequence = input.sequence; time = input.timeMs;
    if (state !== 'playable') return;
    for (const listener of listeners) listener(clone(input));
  }
  function release(provider, at = time < 0 ? 0 : time) {
    if (!provider) return;
    publish({ sequence: sequence + 1, timeMs: Math.max(at, time), provider, connected: true, buttons: {}, axes: {} });
  }
  const services = Object.freeze({ sdkVersion: SDK_VERSION, saves, emit,
    onInput(listener) { live(); if (typeof listener !== 'function' || listeners.size >= 16) fail('Invalid input listener'); listeners.add(listener); return () => listeners.delete(listener); },
    presentation: Object.freeze({
      getState() { live(); return clone(presentationState); },
      onChange(listener) { live(); if (typeof listener !== 'function' || presentationListeners.size >= 16) fail('Invalid presentation listener'); presentationListeners.add(listener); return () => presentationListeners.delete(listener); },
      async request(mode) { live(); if (!['embedded', 'fullscreen'].includes(mode)) fail('Invalid presentation'); return { mode: presentationState.mode, granted: mode === presentationState.mode }; },
    }),
    audio: Object.freeze({
      getState() { live(); return clone(audioState); },
      onChange(listener) { live(); if (typeof listener !== 'function' || audioListeners.size >= 16) fail('Invalid audio listener'); audioListeners.add(listener); return () => audioListeners.delete(listener); },
      async requestPlayback() { live(); return { granted: audioState.state === 'ready', state: clone(audioState) }; },
    }),
    telemetry: Object.freeze({ emit(event) { live(); if (!exact(event, ['type', 'value']) || !['loadDurationMs', 'frameDurationMs'].includes(event.type) || !Number.isFinite(event.value) || event.value < 0 || event.value > 600000) fail('Invalid telemetry'); /* Deliberately no network/PII. */ } }),
  });
  return Object.freeze({ services,
    get state() { return state; }, get events() { return clone(events); }, get listenerCount() { return listeners.size + presentationListeners.size + audioListeners.size; },
    deliverInput(input) {
      live();
      if (!exact(input, ['sequence', 'timeMs', 'provider', 'connected', 'buttons', 'axes']) || !Number.isSafeInteger(input.sequence) || input.sequence <= sequence || !Number.isFinite(input.timeMs) || input.timeMs < 0 || input.timeMs < time || !providers.includes(input.provider) || typeof input.connected !== 'boolean') fail('Invalid input envelope');
      if (!checkControls(input.buttons, 0, input.connected) || !checkControls(input.axes, -1, input.connected)) fail('Invalid logical controls');
      publish(clone(input));
    },
    deliverRawInput(input) {
      live();
      if (!exact(input, ['timeMs', 'provider', 'connected', 'buttons', 'axes']) || !Number.isFinite(input.timeMs) || input.timeMs < 0 || input.timeMs < time || !providers.includes(input.provider) || typeof input.connected !== 'boolean' || !checkControls(input.buttons, 0, input.connected) || !checkControls(input.axes, -1, input.connected)) fail('Invalid raw input');
      if (!focused) { time = input.timeMs; return; }
      if (activeProvider && activeProvider !== input.provider) release(activeProvider, input.timeMs);
      activeProvider = input.connected ? input.provider : null;
      publish({ sequence: sequence + 1, timeMs: input.timeMs, provider: input.provider, connected: input.connected, buttons: mapControls(input.buttons, mapping.buttons, inputDeadzone, false), axes: mapControls(input.axes, mapping.axes, inputDeadzone, true) });
    },
    setInputFocus(next, at = time < 0 ? 0 : time) {
      live(); if (typeof next !== 'boolean' || !Number.isFinite(at) || at < time) fail('Invalid input focus');
      if (focused && !next) release(activeProvider, at);
      focused = next; time = Math.max(time, at);
    },
    remapInput(next, at = time < 0 ? 0 : time) {
      live(); const checked = checkMapping(next); if (!Number.isFinite(at) || at < time) fail('Invalid remap time');
      release(activeProvider, at); mapping = checked; time = Math.max(time, at);
    },
    updatePresentation(next) {
      live(); presentationState = checkPresentation(next);
      for (const listener of presentationListeners) listener(clone(presentationState));
    },
    updateAudio(next) {
      live(); audioState = checkAudio(next);
      for (const listener of audioListeners) listener(clone(audioState));
    },
    updateSaveStatus(next) {
      live(); if (!exact(next, ['local', 'sync']) || !['available', 'unavailable'].includes(next.local) || !syncStates.includes(next.sync)) fail('Invalid save status');
      saveAvailability = clone(next);
    },
    exportSaves() {
      live(); return clone({ schemaVersion, records: [...records].map(([slot, record]) => ({ slot, schemaVersion: record.schemaVersion, bytes: record.bytes })) });
    },
    resetSaves() { live(); records.clear(); },
    async migrateSaves(migrate) {
      live(); if (typeof migrate !== 'function') fail('Invalid save migrator');
      const migrated = new Map(records);
      for (const [slot, record] of records) {
        if (record.schemaVersion === schemaVersion) continue;
        const value = await migrate(slot, clone(record), schemaVersion);
        validateSave(value);
        migrated.set(slot, { schemaVersion, bytes: new Uint8Array(value.bytes), revision: String(++revision) });
      }
      records.clear(); for (const [slot, record] of migrated) records.set(slot, record);
    },
    dispose() { disposed = true; state = 'disposed'; listeners.clear(); presentationListeners.clear(); audioListeners.clear(); records.clear(); },
  });
}
