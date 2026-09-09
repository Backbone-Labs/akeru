/** Executable contract model, not a browser sandbox or production persistence. */
import { validateManifest, SDK_VERSION } from './index.js';

const fail = message => { throw new Error(message); };
const clone = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
const slotValid = slot => typeof slot === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(slot);

/** Trusted host calls this with immutable registry identity and detected capabilities. */
export function planLaunch(manifest, { grants, graphics, features, shellOrigin, titleOrigin }) {
  const result = validateManifest(manifest);
  if (!result.valid) fail(result.errors.join('; '));
  const origin = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value) fail('Expected a canonical HTTPS origin');
    return url.origin;
  };
  if (origin(shellOrigin) === origin(titleOrigin)) fail('Title and shell must have different origins');
  if (manifest.capabilities.some(c => !grants.includes(c))) fail('Missing host capability grant');
  if (manifest.runtime.requiredFeatures.some(f => !features.includes(f))) fail('Missing runtime feature');
  const requested = manifest.runtime.graphics;
  const renderer = [requested.preferred, requested.fallback].find(r => r && graphics.includes(r));
  if (!renderer) fail('Missing graphics capability');
  // CSP blocks fetch/WebSocket and external resources. Navigation still requires host enforcement.
  const csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors " + shellOrigin;
  if (manifest.runtime.requiredFeatures.includes('threads')) fail('Threaded runtime requires a separately verified worker/isolation policy');
  return Object.freeze({ renderer, titleOrigin, sandbox: 'allow-scripts allow-same-origin', headers: Object.freeze({
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  }) });
}

/** One instance per trusted title + guest/account identity. Never accept identity from game messages. */
export function createReferenceHost({ schemaVersion = 1, maxBytes = 65536, maxSlots = 8 } = {}) {
  if (![schemaVersion, maxBytes, maxSlots].every(n => Number.isSafeInteger(n) && n > 0) || maxBytes > 16777216 || maxSlots > 128) fail('Invalid host save limits');
  let state = 'created', sequence = -1, time = -1, revision = 0, disposed = false;
  const records = new Map(), listeners = new Set(), events = [];
  const live = () => { if (disposed || state === 'exit' || state === 'fatal') fail('Session ended'); };
  const checkSlot = slot => { live(); if (!slotValid(slot)) fail('Invalid slot'); };
  const saves = Object.freeze({
    async read(slot) { checkSlot(slot); return clone(records.get(slot) ?? null); },
    async write(slot, value, expectedRevision) {
      checkSlot(slot);
      if (!exact(value, ['schemaVersion', 'bytes']) || value.schemaVersion !== schemaVersion || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength > maxBytes) fail('Invalid save');
      const previous = records.get(slot);
      if ((previous?.revision ?? null) !== expectedRevision) fail('Revision conflict');
      if (!previous && records.size >= maxSlots) fail('Slot quota exceeded');
      const record = { schemaVersion, bytes: new Uint8Array(value.bytes), revision: String(++revision) };
      records.set(slot, record); return clone(record);
    },
    async remove(slot, expectedRevision) { checkSlot(slot); if (!records.has(slot) || records.get(slot).revision !== expectedRevision) fail('Revision conflict'); records.delete(slot); },
    async status() { live(); return { local: 'available', sync: 'disabled' }; },
  });
  function emit(event) {
    live();
    const shapes = { loading: ['type', 'progress'], playable: ['type'], paused: ['type'], resumed: ['type'], exit: ['type'], fatal: ['type', 'code', 'message'], roundEnd: ['type', 'result'] };
    if (!exact(event, shapes[event?.type] ?? []) || !shapes[event.type]) fail('Invalid lifecycle event');
    if (event.type === 'loading' && event.progress !== undefined && (!Number.isFinite(event.progress) || event.progress < 0 || event.progress > 1)) fail('Invalid progress');
    if (event.type === 'fatal' && (typeof event.code !== 'string' || event.code.length > 64 || typeof event.message !== 'string' || event.message.length > 256)) fail('Invalid fatal event');
    if (event.type === 'roundEnd' && event.result !== undefined && !['completed', 'failed'].includes(event.result)) fail('Invalid round result');
    const allowed = { created: ['loading', 'fatal', 'exit'], loading: ['loading', 'playable', 'fatal', 'exit'], playable: ['paused', 'roundEnd', 'fatal', 'exit'], paused: ['resumed', 'fatal', 'exit'] };
    if (!allowed[state]?.includes(event.type)) fail('Invalid lifecycle transition');
    state = event.type === 'resumed' || event.type === 'roundEnd' ? 'playable' : event.type;
    events.push(clone(event));
    if (events.length > 128) events.shift();
  }
  const services = Object.freeze({ sdkVersion: SDK_VERSION, saves, emit,
    onInput(listener) { live(); if (typeof listener !== 'function' || listeners.size >= 16) fail('Invalid input listener'); listeners.add(listener); return () => listeners.delete(listener); },
    presentation: Object.freeze({ async request(mode) { live(); if (!['embedded', 'fullscreen'].includes(mode)) fail('Invalid presentation'); return { mode: 'embedded', granted: false }; } }),
    telemetry: Object.freeze({ emit(event) { live(); if (!exact(event, ['type', 'value']) || !['loadDurationMs', 'frameDurationMs'].includes(event.type) || !Number.isFinite(event.value) || event.value < 0 || event.value > 600000) fail('Invalid telemetry'); /* Deliberately no network/PII. */ } }),
  });
  return Object.freeze({ services,
    get state() { return state; }, get events() { return clone(events); }, get listenerCount() { return listeners.size; },
    deliverInput(input) {
      live();
      if (!exact(input, ['sequence', 'timeMs', 'provider', 'connected', 'buttons', 'axes']) || !Number.isSafeInteger(input.sequence) || input.sequence <= sequence || !Number.isFinite(input.timeMs) || input.timeMs < 0 || input.timeMs < time || !['gamepad', 'touch', 'native-input'].includes(input.provider) || typeof input.connected !== 'boolean') fail('Invalid input envelope');
      const controls = (values, min) => values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).length <= 32 && Object.entries(values).every(([k,v]) => /^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(k) && Number.isFinite(v) && v >= min && v <= 1 && (input.connected || v === 0));
      if (!controls(input.buttons, 0) || !controls(input.axes, -1)) fail('Invalid logical controls');
      sequence = input.sequence; time = input.timeMs;
      if (state !== 'playable') return;
      for (const listener of listeners) listener(clone(input));
    },
    dispose() { disposed = true; state = 'disposed'; listeners.clear(); records.clear(); },
  });
}
