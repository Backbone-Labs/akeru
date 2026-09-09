import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReferenceHost, planLaunch } from '../packages/contracts/src/reference-host.js';
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
test('generated CSP denies outbound connections, embedding and unsafe privileges', () => {
 const plan = planLaunch(manifest, policy);
 assert.match(plan.headers['Content-Security-Policy'], /connect-src 'none'/);
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
test('disposed sessions revoke save access and invalid quotas cannot disable bounds', async () => {
 assert.throws(() => createReferenceHost({ maxBytes: Infinity }));
 const h = createReferenceHost(); h.dispose();
 await assert.rejects(h.services.saves.read('progress'));
 assert.throws(() => h.services.onInput(() => {}));
});
