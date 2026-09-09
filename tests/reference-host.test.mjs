import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertTitleAdapterV1, createReferenceHost, planLaunch } from '../packages/contracts/src/reference-host.js';
import { createAdapter } from '../examples/reference-adapter/adapter.js';
const manifest = JSON.parse(await readFile(new URL('../examples/contract-fixture/akeru.json', import.meta.url)));
const policy = { grants: ['save.local'], graphics: ['webgl2'], features: [], shellOrigin: 'https://shell.example.com', titleOrigin: 'https://fixture.games.example.net' };
const input = { sequence: 0, timeMs: 0, provider: 'gamepad', connected: true, buttons: { south: 1 }, axes: { leftX: 0 } };
test('reference adapter lifecycle, interchangeable touch/controller and teardown', async () => {
 const host = createReferenceHost(), adapter = createAdapter(); await adapter.initialize(host.services);
 host.deliverInput(input); host.deliverInput({ ...input, provider: 'touch', sequence: 1 }); assert.equal(adapter.received.length, 2);
 await adapter.pause(); host.deliverInput({ ...input, sequence: 2 }); assert.equal(adapter.received.length, 0);
 await adapter.resume(); await adapter.dispose(); await adapter.dispose(); assert.equal(host.listenerCount, 0);
 host.services.emit({ type: 'exit' }); assert.throws(() => host.services.emit({ type: 'playable' })); host.dispose();
});
test('reject lifecycle violations and private/unbounded telemetry', () => {
 const h = createReferenceHost(); assert.throws(() => h.services.emit({ type: 'playable' }));
 assert.throws(() => h.services.emit({ type: 'loading', progress: NaN }));
 assert.throws(() => h.services.telemetry.emit({ type: 'loadDurationMs', value: 1, userId: 'private' }));
 assert.throws(() => h.services.telemetry.emit({ type: 'unknown', value: 1 }));
 h.services.telemetry.emit({ type: 'frameDurationMs', value: 16 });
});
test('input rejects replay, hidden capabilities, nonfinite values and stale disconnects', () => {
 const h = createReferenceHost(); h.deliverInput(input);
 for (const invalid of [input, { ...input, sequence: 1, axes: { leftX: NaN } }, { ...input, sequence: 1, nativeCommand: 'readFile' }, { ...input, sequence: 1, connected: false }]) assert.throws(() => h.deliverInput(invalid));
});
test('saves cannot cross title/player instances, alias bytes, bypass CAS or exceed quotas', async () => {
 const a = createReferenceHost({ maxSlots: 1, maxBytes: 2 }), b = createReferenceHost();
 const value = { schemaVersion: 1, bytes: new Uint8Array([1]) };
 const record = await a.services.saves.write('progress', value, null); value.bytes[0] = 2; record.bytes[0] = 3;
 assert.equal((await a.services.saves.read('progress')).bytes[0], 1); assert.equal(await b.services.saves.read('progress'), null);
 await assert.rejects(a.services.saves.write('progress', value, null)); await assert.rejects(a.services.saves.write('other', value, null));
 await assert.rejects(a.services.saves.read('../other-title')); await assert.rejects(a.services.saves.write('progress', { ...value, bytes: new Uint8Array(3) }, record.revision));
 await assert.rejects(a.services.saves.write('progress', { ...value, titleId: 'other' }, record.revision));
 await a.services.saves.remove('progress', record.revision); await assert.rejects(a.services.saves.remove('progress', record.revision));
});
test('launch denies missing grants, graphics, runtime features and shell-origin execution', () => {
 for (const overrides of [{ grants: [] }, { graphics: [] }, { titleOrigin: policy.shellOrigin }]) assert.throws(() => planLaunch(manifest, { ...policy, ...overrides }));
 const required = structuredClone(manifest); required.runtime.requiredFeatures = ['simd']; assert.throws(() => planLaunch(required, policy));
 const gpu = structuredClone(manifest); gpu.runtime.graphics = { preferred: 'webgpu', fallback: 'webgl2' }; assert.equal(planLaunch(gpu, policy).renderer, 'webgl2');
 gpu.runtime.graphics.fallback = null; assert.throws(() => planLaunch(gpu, policy));
});
test('generated CSP permits reviewed same-origin fetch and denies external connections', () => {
 const plan = planLaunch(manifest, policy);
 assert.match(plan.headers['Content-Security-Policy'], /connect-src 'self'/);
 assert.match(plan.headers['Content-Security-Policy'], /frame-src 'none'/);
 assert.match(plan.headers['Content-Security-Policy'], /form-action 'none'/);
 assert.equal(plan.sandbox, 'allow-scripts allow-same-origin');
 assert.equal(plan.publicationApproved, undefined);
});
test('presentation requests cannot grant navigation or native authority', async () => {
 const h = createReferenceHost(); assert.deepEqual(await h.services.presentation.request('fullscreen'), { mode: 'embedded', granted: false });
 await assert.rejects(h.services.presentation.request('openNativeSettings'));
});

test('threaded builds fail closed until a worker/isolation policy exists', () => {
 const threaded = structuredClone(manifest); threaded.runtime.requiredFeatures = ['threads'];
 assert.throws(() => planLaunch(threaded, { ...policy, features: ['threads'] }), /Threaded/);
});

test('runtime adapter check requires lifecycle capabilities and controller/touch help', () => {
 const adapter = createAdapter(); assert.equal(assertTitleAdapterV1(adapter), adapter);
 for (const missing of ['initialize', 'pause', 'resume', 'dispose']) {
  const invalid = createAdapter(); delete invalid[missing];
  assert.throws(() => assertTitleAdapterV1(invalid), new RegExp(`Missing adapter capability: ${missing}`));
 }
 const noTouchHelp = createAdapter(); noTouchHelp.controlHelp.touch = [];
 assert.throws(() => assertTitleAdapterV1(noTouchHelp), /Invalid control help/);
 const internalState = createAdapter(); internalState.renderState = { ready: false };
 assert.equal(assertTitleAdapterV1(internalState), internalState);
});

test('raw input applies mappings and deadzones and clears held state on transitions', async () => {
 const h = createReferenceHost({ inputDeadzone: 0.2 }), adapter = createAdapter(); await adapter.initialize(h.services);
 h.deliverRawInput({ timeMs: 1, provider: 'gamepad', connected: true, buttons: { south: 1 }, axes: { leftX: 0.1, leftY: -0.6 } });
 assert.deepEqual(adapter.received.at(-1).buttons, { confirm: 1 });
 assert.equal(adapter.received.at(-1).axes.moveX, 0);
 assert.ok(Math.abs(adapter.received.at(-1).axes.moveY + 0.5) < Number.EPSILON);
 h.deliverRawInput({ timeMs: 2, provider: 'touch', connected: true, buttons: { south: 1 }, axes: {} });
 assert.deepEqual(adapter.received.at(-2).buttons, {}); // provider switch releases gamepad state first
 h.setInputFocus(false, 3); assert.deepEqual(adapter.received.at(-1).buttons, {});
 h.deliverRawInput({ timeMs: 4, provider: 'touch', connected: true, buttons: { south: 1 }, axes: {} });
 assert.equal(adapter.received.at(-1).timeMs, 3); // input while unfocused is suppressed
 h.setInputFocus(true, 4);
 h.remapInput({ buttons: { east: 'confirm' }, axes: {} }, 5);
 h.deliverRawInput({ timeMs: 6, provider: 'gamepad', connected: true, buttons: { south: 1, east: 0.5 }, axes: {} });
 assert.deepEqual(adapter.received.at(-1).buttons, { confirm: 0.5 });
 h.deliverRawInput({ timeMs: 7, provider: 'gamepad', connected: false, buttons: { east: 0 }, axes: {} });
 assert.equal(adapter.received.at(-1).connected, false);
 assert.throws(() => h.remapInput({ buttons: { south: 'confirm', east: 'confirm' }, axes: {} }, 8), /Invalid input mapping/);
 assert.throws(() => h.deliverRawInput({ timeMs: 8, provider: 'gamepad', connected: false, buttons: { east: 1 }, axes: {} }), /Invalid raw input/);
 await adapter.dispose();
});

test('presentation and audio expose bounded host state and consent/interruption results', async () => {
 const h = createReferenceHost(), seen = [];
 h.services.presentation.onChange(value => seen.push(value));
 assert.deepEqual(h.services.presentation.getState(), { mode: 'embedded', orientation: 'landscape', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
 assert.equal((await h.services.presentation.request('fullscreen')).granted, false);
 h.updatePresentation({ mode: 'fullscreen', orientation: 'portrait', safeArea: { top: 24, right: 0, bottom: 12, left: 0 } });
 assert.equal(seen[0].safeArea.top, 24);
 assert.equal((await h.services.presentation.request('fullscreen')).granted, true);
 assert.equal((await h.services.audio.requestPlayback()).granted, false);
 h.updateAudio({ state: 'ready', reason: null }); assert.equal((await h.services.audio.requestPlayback()).granted, true);
 h.updateAudio({ state: 'interrupted', reason: 'background' }); assert.equal((await h.services.audio.requestPlayback()).granted, false);
 assert.throws(() => h.updatePresentation({ mode: 'fullscreen', orientation: 'square', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } }));
 assert.throws(() => h.updatePresentation({ mode: 'fullscreen', orientation: 'portrait', safeArea: {} }));
 assert.throws(() => h.updateAudio({ state: 'ready', reason: 'background' }));
});

test('host-owned save migration, export, reset, quota and availability stay identity scoped', async () => {
 const h = createReferenceHost({ schemaVersion: 2, maxSlots: 2, maxBytes: 4, initialSaves: [{ slot: 'progress', schemaVersion: 1, bytes: new Uint8Array([1]) }] });
 assert.equal((await h.services.saves.status()).quota.usedBytes, 1);
 await h.migrateSaves(async (slot, record, target) => ({ schemaVersion: target, bytes: new Uint8Array([record.bytes[0], 2]) }));
 assert.equal((await h.services.saves.read('progress')).schemaVersion, 2);
 const exported = h.exportSaves(); exported.records[0].bytes[0] = 9;
 assert.deepEqual([...h.exportSaves().records[0].bytes], [1, 2]);
 assert.equal(h.services.saves.export, undefined); assert.equal(h.services.saves.reset, undefined);
 h.updateSaveStatus({ local: 'unavailable', sync: 'error' });
 assert.deepEqual((await h.services.saves.status()).sync, 'error');
 await assert.rejects(h.services.saves.write('other', { schemaVersion: 2, bytes: new Uint8Array([1]) }, null), /unavailable/);
 h.resetSaves(); assert.equal((await h.services.saves.status()).quota.usedSlots, 0);
});

test('save migration is atomic when an adapter returns an invalid target record', async () => {
 const h = createReferenceHost({ schemaVersion: 2, initialSaves: [{ slot: 'one', schemaVersion: 1, bytes: new Uint8Array([1]) }, { slot: 'two', schemaVersion: 1, bytes: new Uint8Array([2]) }] });
 await assert.rejects(h.migrateSaves(async slot => slot === 'one' ? { schemaVersion: 2, bytes: new Uint8Array([3]) } : { schemaVersion: 1, bytes: new Uint8Array([4]) }));
 assert.equal((await h.services.saves.read('one')).schemaVersion, 1);
 assert.equal((await h.services.saves.read('two')).schemaVersion, 1);
});

test('launch rejects a manifest incompatible with the selected host SDK', () => {
 assert.throws(() => planLaunch(manifest, { ...policy, sdkVersion: '0.2.0' }), /sdk\/range/);
 assert.equal(planLaunch(manifest, policy).sdkVersion, '0.1.0');
});
test('disposed sessions revoke save access and invalid quotas cannot disable bounds', async () => {
 assert.throws(() => createReferenceHost({ maxBytes: Infinity }));
 const h = createReferenceHost(); h.dispose();
 await assert.rejects(h.services.saves.read('progress'));
 assert.throws(() => h.services.onInput(() => {}));
});
