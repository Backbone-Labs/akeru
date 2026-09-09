import { assertTitleAdapterV1, createReferenceHost } from '/session.js';
import { createAdapter } from '/adapter.js';
const expected = new URLSearchParams(location.hash.slice(1));
const shell = expected.get('shell');
const nonce = expected.get('nonce');
const name = expected.get('name');
const collector = expected.get('collector');
const host = createReferenceHost();
const adapter = assertTitleAdapterV1(createAdapter());
await adapter.initialize(host.services);
host.deliverInput({ sequence: 0, timeMs: 0, provider: 'touch', connected: true, buttons: { south: 1 }, axes: {} });
host.deliverInput({ sequence: 1, timeMs: 1, provider: 'gamepad', connected: true, buttons: { south: 1 }, axes: {} });
const inputWorked = adapter.received.length === 2;
const saved = await host.services.saves.write('progress', { schemaVersion: 1, bytes: new Uint8Array([42]) }, null);
const storageWorked = (await host.services.saves.read('progress')).bytes[0] === 42;
await host.services.saves.remove('progress', saved.revision);
const presentation = await host.services.presentation.request('fullscreen');
const presentationWorked = presentation.mode === 'embedded' && !presentation.granted;
const initialPresentation = host.services.presentation.getState();
host.updatePresentation({ mode: 'embedded', orientation: 'portrait', safeArea: { top: 10, right: 0, bottom: 20, left: 0 } });
const presentationStateWorked = initialPresentation.orientation === 'landscape' && host.services.presentation.getState().safeArea.bottom === 20;
const audioBlocked = !(await host.services.audio.requestPlayback()).granted;
host.updateAudio({ state: 'ready', reason: null });
const audioWorked = audioBlocked && (await host.services.audio.requestPlayback()).granted;
const wasm = await WebAssembly.instantiateStreaming(fetch('/module.wasm'));
const sameOriginWasmWorked = wasm.instance instanceof WebAssembly.Instance;
const artifactHostWorked = (await fetch('/module.wasm?variant=1')).status === 404 && (await fetch('/module.wasm', { method: 'POST' })).status === 405 && (await fetch('/undeclared.bin')).status === 404;
host.services.telemetry.emit({ type: 'frameDurationMs', value: 16 });
let telemetryWorked = false;
try { host.services.telemetry.emit({ type: 'frameDurationMs', value: 16, userId: 'forbidden' }); } catch { telemetryWorked = true; }
await adapter.pause(); await adapter.resume(); await adapter.dispose();
host.services.emit({ type: 'exit' });
const violations = [];
addEventListener('securitypolicyviolation', e => violations.push(e.effectiveDirective));
let blockedFetch = false, blockedDOM = false;
try { await fetch(collector + '/fetch'); } catch { blockedFetch = true; }
try { parent.document.body.dataset.compromised = 'yes'; } catch { blockedDOM = true; }
const image = new Image(); image.src = collector + '/image';
const script = document.createElement('script'); script.src = collector + '/script'; document.body.append(script);
const frame = document.createElement('iframe'); frame.src = collector + '/frame'; document.body.append(frame);
const absent = localStorage.getItem('akeru-conformance') === null;
localStorage.setItem('akeru-conformance', name);
// The same key on a different title origin must remain independent after both writes.
setTimeout(() => parent.postMessage({ type: 'result', nonce, name, adapterWorked: true, inputWorked, storageWorked, presentationWorked, presentationStateWorked, audioWorked, sameOriginWasmWorked, artifactHostWorked, telemetryWorked, lifecycleWorked: host.state === 'exit', listenersReleased: host.listenerCount === 0, blockedFetch, blockedDOM, absent, ownStorage: localStorage.getItem('akeru-conformance') === name, violations }, shell), 100);
