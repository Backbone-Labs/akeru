import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateManifest, validatePackage } from '@akeru/contracts';
const fixture = new URL('../examples/contract-fixture/', import.meta.url);
const original = JSON.parse(await readFile(new URL('akeru.json', fixture), 'utf8'));
function changed(change) { const value = structuredClone(original); change(value); return value; }

test('original fixture validates through public package exports and CLI', async () => {
  assert.deepEqual(validateManifest(original), { valid: true, errors: [] });
  assert.equal((await validatePackage(fixture)).valid, true);
  const cli = spawnSync(process.execPath, ['packages/contracts/src/cli.js', 'examples/contract-fixture'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).valid, true);
});

const negatives = {
  'unknown spec': m => m.specVersion = '2.0.0',
  'invalid package version': m => m.version = 'latest',
  'incompatible SDK': m => m.sdk.range = '^2.0.0',
  'malformed SDK range': m => m.sdk.range = 'banana',
  'missing touch': m => delete m.input.touch,
  'missing controller': m => m.input.controller = false,
  'absolute entry': m => m.entry = '/index.html',
  'path escape': m => m.artifacts[0].path = '../outside.html',
  'encoded traversal': m => m.artifacts[0].path = '%2e%2e/outside.html',
  'backslash escape': m => m.artifacts[0].path = '..\\outside.html',
  'remote artifact': m => m.artifacts[0].path = 'https://example.com/index.html',
  'bad digest': m => m.artifacts[0].sha256 = '123',
  'unhashed entry': m => m.entry = 'other.html',
  'duplicate path with different digest': m => m.artifacts.push({ ...m.artifacts[0], sha256: '0'.repeat(64) }),
  'missing asset evidence': m => m.provenance.assets = [],
  'uncovered artifact': m => m.provenance.assets[0].path = 'other.html',
  'unsafe source URL': m => m.provenance.source.url = 'javascript:alert(1)',
  'credential URL': m => m.provenance.source.url = 'https://secret@example.com/source',
  'unsafe asset evidence': m => m.provenance.assets[0].evidence = ['http://example.com'],
  'self-granted permission': m => m.grants = ['native.all'],
  'self-approved title': m => m.approved = true,
  'self-declared trust': m => m.creatorTier = 'backbone',
  'unknown capability': m => m.capabilities.push('native.all'),
  'network capability unavailable in v1': m => m.capabilities.push('network'),
  'cloud sync without capability': m => m.saves.accountSync = 'optional',
  'cloud capability without sync declaration': m => m.capabilities.push('save.account-sync'),
  'local saving missing': m => m.capabilities = [],
  'guest save disabled': m => m.saves.guestLocal = false,
  'contradictory features': m => { m.runtime.requiredFeatures = ['threads']; m.runtime.optionalFeatures = ['threads']; },
  'invalid graphics fallback': m => m.runtime.graphics.fallback = 'webgl2',
};
for (const [name, mutate] of Object.entries(negatives)) {
  test(`rejects ${name}`, () => assert.equal(validateManifest(changed(mutate)).valid, false));
}

test('WebGPU may require support or explicitly declare a WebGL2 fallback', () => {
  for (const fallback of [null, 'webgl2']) {
    assert.equal(validateManifest(changed(m => m.runtime.graphics = { preferred: 'webgpu', fallback })).valid, true);
  }
});
test('unknown rights remain valid data, without approval or grants', () => {
  const result = validateManifest(changed(m => m.provenance.source.rightsStatus = 'unknown'));
  assert.deepEqual(result, { valid: true, errors: [] });
});
test('optional account sync is declarative; it does not return credentials or grants', () => {
  assert.deepEqual(validateManifest(changed(m => {
    m.saves.accountSync = 'optional'; m.capabilities.push('save.account-sync');
  })), { valid: true, errors: [] });
});
test('tampered, missing and symlink-escaped files fail integrity validation', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'akeru-contract-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'package');
  await cp(fixture, pkg, { recursive: true });
  await writeFile(join(pkg, 'index.html'), 'tampered');
  assert.match((await validatePackage(pkg)).errors.join(), /SHA-256 mismatch/);
  await rm(join(pkg, 'index.html'));
  assert.equal((await validatePackage(pkg)).valid, false);
  await writeFile(join(dir, 'outside.html'), 'outside');
  await symlink(join(dir, 'outside.html'), join(pkg, 'index.html'));
  assert.match((await validatePackage(pkg)).errors.join(), /escapes package root/);
});
test('manifest symlinks cannot select a manifest outside the package', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'akeru-manifest-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'package');
  await cp(fixture, pkg, { recursive: true });
  await rm(join(pkg, 'akeru.json'));
  await writeFile(join(dir, 'outside.json'), JSON.stringify(original));
  await symlink(join(dir, 'outside.json'), join(pkg, 'akeru.json'));
  assert.match((await validatePackage(pkg)).errors.join(), /escapes package root/);
});
test('CLI errors have nonzero exit status', () => {
  assert.equal(spawnSync(process.execPath, ['packages/contracts/src/cli.js']).status, 2);
  assert.equal(spawnSync(process.execPath, ['packages/contracts/src/cli.js', '/nonexistent-akeru-fixture']).status, 1);
});
