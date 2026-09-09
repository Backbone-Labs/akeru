import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  mkdtemp,
  cp,
  writeFile,
  rm,
  symlink,
  truncate,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateManifest, validatePackage } from '@akeru/contracts';
const fixture = new URL('../examples/contract-fixture/', import.meta.url);
const original = JSON.parse(
  await readFile(new URL('akeru.json', fixture), 'utf8'),
);
function changed(change) {
  const value = structuredClone(original);
  change(value);
  return value;
}

test('original fixture validates through public package exports and CLI', async () => {
  assert.deepEqual(validateManifest(original), { valid: true, errors: [] });
  assert.equal((await validatePackage(fixture)).valid, true);
  const cli = spawnSync(
    process.execPath,
    ['packages/contracts/src/cli.js', 'examples/contract-fixture'],
    { encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).valid, true);
});

const negatives = {
  'unknown spec': (m) => (m.specVersion = '2.0.0'),
  'invalid package version': (m) => (m.version = 'latest'),
  'noncanonical package version': (m) => (m.version = 'v1.0.0'),
  'floating source revision': (m) => (m.provenance.source.revision = 'main'),
  'abbreviated source revision': (m) =>
    (m.provenance.source.revision = 'abc1234'),
  'uppercase source revision': (m) =>
    (m.provenance.source.revision = 'A'.repeat(40)),
  'incompatible SDK': (m) => (m.sdk.range = '^2.0.0'),
  'malformed SDK range': (m) => (m.sdk.range = 'banana'),
  'missing touch': (m) => delete m.input.touch,
  'missing controller': (m) => (m.input.controller = false),
  'absolute entry': (m) => (m.entry = '/index.html'),
  'path escape': (m) => (m.artifacts[0].path = '../outside.html'),
  'encoded traversal': (m) => (m.artifacts[0].path = '%2e%2e/outside.html'),
  'backslash escape': (m) => (m.artifacts[0].path = '..\\outside.html'),
  'remote artifact': (m) =>
    (m.artifacts[0].path = 'https://example.com/index.html'),
  'bad digest': (m) => (m.artifacts[0].sha256 = '123'),
  'unhashed entry': (m) => (m.entry = 'other.html'),
  'duplicate path with different digest': (m) =>
    m.artifacts.push({ ...m.artifacts[0], sha256: '0'.repeat(64) }),
  'missing asset evidence': (m) => (m.provenance.assets = []),
  'uncovered artifact': (m) => (m.provenance.assets[0].path = 'other.html'),
  'unsafe source URL': (m) => (m.provenance.source.url = 'javascript:alert(1)'),
  'credential URL': (m) =>
    (m.provenance.source.url = 'https://secret@example.com/source'),
  'out-of-range URL port': (m) =>
    (m.provenance.source.url = 'https://example.com:99999/source'),
  'unsafe asset evidence': (m) =>
    (m.provenance.assets[0].evidence = ['http://example.com']),
  'self-granted permission': (m) => (m.grants = ['native.all']),
  'self-approved title': (m) => (m.approved = true),
  'self-declared trust': (m) => (m.creatorTier = 'backbone'),
  'unknown capability': (m) => m.capabilities.push('native.all'),
  'network capability unavailable in v1': (m) => m.capabilities.push('network'),
  'cloud sync without capability': (m) => (m.saves.accountSync = 'optional'),
  'cloud capability without sync declaration': (m) =>
    m.capabilities.push('save.account-sync'),
  'local saving missing': (m) => (m.capabilities = []),
  'guest save disabled': (m) => (m.saves.guestLocal = false),
  'contradictory features': (m) => {
    m.runtime.requiredFeatures = ['threads'];
    m.runtime.optionalFeatures = ['threads'];
  },
  'invalid graphics fallback': (m) => (m.runtime.graphics.fallback = 'webgl2'),
};
for (const [name, mutate] of Object.entries(negatives)) {
  test(`rejects ${name}`, () =>
    assert.equal(validateManifest(changed(mutate)).valid, false));
}

test('WebGPU may require support or explicitly declare a WebGL2 fallback', () => {
  for (const fallback of [null, 'webgl2']) {
    assert.equal(
      validateManifest(
        changed(
          (m) => (m.runtime.graphics = { preferred: 'webgpu', fallback }),
        ),
      ).valid,
      true,
    );
  }
});
test('unknown rights remain valid data, without approval or grants', () => {
  const result = validateManifest(
    changed((m) => (m.provenance.source.rightsStatus = 'unknown')),
  );
  assert.deepEqual(result, { valid: true, errors: [] });
});
test('optional account sync is declarative; it does not return credentials or grants', () => {
  assert.deepEqual(
    validateManifest(
      changed((m) => {
        m.saves.accountSync = 'optional';
        m.capabilities.push('save.account-sync');
      }),
    ),
    { valid: true, errors: [] },
  );
});
test('tampered, missing and symlink-escaped files fail integrity validation', async (t) => {
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
  assert.match(
    (await validatePackage(pkg)).errors.join(),
    /escapes package root/,
  );
});
test('manifest symlinks cannot select a manifest outside the package', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'akeru-manifest-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'package');
  await cp(fixture, pkg, { recursive: true });
  await rm(join(pkg, 'akeru.json'));
  await writeFile(join(dir, 'outside.json'), JSON.stringify(original));
  await symlink(join(dir, 'outside.json'), join(pkg, 'akeru.json'));
  assert.match(
    (await validatePackage(pkg)).errors.join(),
    /escapes package root/,
  );
});
test('CLI errors have nonzero exit status', () => {
  assert.equal(
    spawnSync(process.execPath, ['packages/contracts/src/cli.js']).status,
    2,
  );
  assert.equal(
    spawnSync(process.execPath, [
      'packages/contracts/src/cli.js',
      '/nonexistent-akeru-fixture',
    ]).status,
    1,
  );
});

test('DOM and Canvas2D packages need no GPU renderer and cannot claim WebGL2 fallback', () => {
  for (const preferred of ['dom', 'canvas2d']) {
    assert.equal(
      validateManifest(
        changed((m) => (m.runtime.graphics = { preferred, fallback: null })),
      ).valid,
      true,
    );
    assert.equal(
      validateManifest(
        changed(
          (m) => (m.runtime.graphics = { preferred, fallback: 'webgl2' }),
        ),
      ).valid,
      false,
    );
  }
});
test('full Git SHA-1 and SHA-256 source identities are supported', () => {
  for (const length of [40, 64]) {
    assert.equal(
      validateManifest(
        changed((m) => (m.provenance.source.revision = 'a'.repeat(length))),
      ).valid,
      true,
    );
  }
});

test('numeric-leading title slugs are valid while unsafe slug forms fail', () => {
  for (const id of ['2048', '2048-classic'])
    assert.equal(validateManifest(changed((m) => (m.id = id))).valid, true);
  for (const id of ['../2048', '-2048', '2048-', '2048/classic', 'Title'])
    assert.equal(validateManifest(changed((m) => (m.id = id))).valid, false);
});

test('rejects oversized arrays before inspecting their entries', () => {
  const manifest = structuredClone(original);
  const oversized = new Array(1025);
  Object.defineProperty(oversized, 0, {
    get() {
      throw new Error('oversized array must not be traversed');
    },
  });
  manifest.artifacts = oversized;
  assert.match(validateManifest(manifest).errors.join(), /limits/);
});

test('rejects excessive evidence, feature and capability counts', () => {
  for (const mutate of [
    (m) => {
      m.provenance.assets[0].evidence = Array.from(
        { length: 17 },
        (_, i) => `https://example.com/${i}`,
      );
    },
    (m) => {
      m.runtime.requiredFeatures = new Array(6).fill('wasm');
    },
    (m) => {
      m.runtime.optionalFeatures = new Array(6).fill('wasm');
    },
    (m) => {
      m.capabilities = new Array(3).fill('save.local');
    },
    (m) => {
      m.provenance.assets = new Array(1025).fill(m.provenance.assets[0]);
    },
  ])
    assert.equal(validateManifest(changed(mutate)).valid, false);
});

test('rejects excessive strings, nesting and cyclic in-memory declarations', () => {
  for (const mutate of [
    (m) => {
      m.title = 'a'.repeat(1024 * 1024);
    },
    (m) => {
      m.extra = m;
    },
    (m) => {
      m.extra = Array.from({ length: 1024 }, () => 'a'.repeat(2048));
    },
  ])
    assert.match(validateManifest(changed(mutate)).errors.join(), /limits/);
});

test('duplicate artifact and provenance paths remain invalid without quadratic schema uniqueness', () => {
  for (const mutate of [
    (m) => m.artifacts.push({ ...m.artifacts[0] }),
    (m) => m.provenance.assets.push({ ...m.provenance.assets[0] }),
  ])
    assert.match(
      validateManifest(changed(mutate)).errors.join(),
      /paths must be unique/,
    );
});

test('schema validation reports only its first error', () => {
  const result = validateManifest({});
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
});

test('rejects oversized manifest and artifact files before consuming their contents', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'akeru-size-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(fixture, dir, { recursive: true });
  await truncate(join(dir, 'akeru.json'), 1024 * 1024 + 1);
  assert.match((await validatePackage(dir)).errors.join(), /size limit/);
  await writeFile(join(dir, 'akeru.json'), JSON.stringify(original));
  await truncate(join(dir, 'index.html'), 256 * 1024 * 1024 + 1);
  assert.match((await validatePackage(dir)).errors.join(), /size limit/);
});

test('rejects nonregular manifest and artifact files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'akeru-file-type-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(fixture, dir, { recursive: true });
  await rm(join(dir, 'index.html'));
  await mkdir(join(dir, 'index.html'));
  assert.match((await validatePackage(dir)).errors.join(), /regular file/);
  await rm(join(dir, 'akeru.json'));
  await mkdir(join(dir, 'akeru.json'));
  assert.match((await validatePackage(dir)).errors.join(), /regular file/);
});
