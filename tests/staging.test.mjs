import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  cpSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packageStaging } from '../scripts/package-staging.mjs';
import { createStagingServer, loadStaging } from '../scripts/serve-staging.mjs';
import {
  changeAvailability,
  updateAvailabilityFile,
} from '../scripts/availability.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'akeru-staging-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({
      engines: { node: process.versions.node },
      packageManager: 'npm@11.17.0',
    }),
  );
  writeFileSync(join(cwd, '.gitignore'), 'dist/\n');
  writeFileSync(join(cwd, 'LICENSE'), 'Original test fixture\n');
  mkdirSync(join(cwd, 'platform'));
  cpSync(
    new URL('../platform/staging', import.meta.url),
    join(cwd, 'platform/staging'),
    { recursive: true },
  );
  git('add', '.');
  git('commit', '-m', 'fixture');
  return cwd;
}

test('staging output reproduces bytes, exposes revision and retains corresponding source', (t) => {
  const cwd = fixture(t);
  const first = packageStaging(cwd);
  const release = readFileSync(join(cwd, 'dist/staging/release.json'));
  const second = packageStaging(cwd);
  assert.deepEqual(first, second);
  assert.deepEqual(
    release,
    readFileSync(join(cwd, 'dist/staging/release.json')),
  );
  const loaded = loadStaging(join(cwd, 'dist/staging'));
  assert.ok(loaded.files.get('/index.html').bytes.includes(first.revision));
  assert.equal(
    loaded.files.get('/LICENSE.txt').bytes.toString(),
    'Original test fixture\n',
  );
});

test('staging refuses tampered, extra, missing, and symlink files before serving', (t) => {
  const cwd = fixture(t);
  const root = join(cwd, 'dist/staging');
  packageStaging(cwd);
  writeFileSync(join(root, 'index.html'), 'tampered');
  assert.throws(() => loadStaging(root), /Digest mismatch/);
  packageStaging(cwd);
  writeFileSync(join(root, 'unreviewed.js'), 'alert(1)');
  assert.throws(() => loadStaging(root), /Unexpected/);
  packageStaging(cwd);
  rmSync(join(root, 'style.css'));
  assert.throws(() => loadStaging(root), /missing/);
  symlinkSync('index.html', join(root, 'style.css'));
  assert.throws(() => loadStaging(root), /regular file/);
});

test('HTTP preview restricts methods and paths, returns revision health and shell security headers', async (t) => {
  const cwd = fixture(t);
  const release = packageStaging(cwd);
  const server = createStagingServer(join(cwd, 'dist/staging'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get('content-security-policy'),
    /connect-src 'none'/,
  );
  assert.match(
    page.headers.get('content-security-policy'),
    /frame-ancestors 'none'/,
  );
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((await page.text()).includes(release.revision));
  assert.equal(
    (await (await fetch(`${origin}/healthz`)).json()).revision,
    release.revision,
  );
  for (const path of [
    '/research/notes.md',
    '/%2e%2e/LICENSE',
    '/.env',
    '//index.html',
    '/index.html/',
  ]) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(origin, { method: 'HEAD' })).text(), '');
  assert.equal(
    (await fetch(`${origin}/source.tar.gz`)).headers.get('content-type'),
    'application/gzip',
  );
});

const current = 'a'.repeat(64),
  previous = 'b'.repeat(64);
const availability = () => ({
  schemaVersion: '1.0.0',
  generation: 1,
  titles: [
    {
      id: 'original-fixture',
      paused: false,
      current,
      releases: [
        { digest: current, version: '1.1.0', saveSchemaVersion: 1 },
        { digest: previous, version: '1.0.0', saveSchemaVersion: 1 },
      ],
    },
  ],
});

test('operator can pause one title and roll back to retained compatible bytes without reactivation', () => {
  const source = availability();
  const paused = changeAvailability(source, 'original-fixture', 'pause');
  assert.equal(source.titles[0].paused, false);
  assert.equal(paused.titles[0].paused, true);
  assert.equal(paused.generation, 2);
  const rollback = changeAvailability(
    paused,
    'original-fixture',
    'rollback',
    previous,
  );
  assert.equal(rollback.titles[0].current, previous);
  assert.equal(rollback.titles[0].paused, true);
  assert.equal(rollback.generation, 3);
  assert.deepEqual(
    changeAvailability(rollback, 'original-fixture', 'pause'),
    rollback,
  );
});

test('rollback rejects unknown artifacts, unsafe save changes, duplicate titles and invented activation', () => {
  assert.throws(
    () =>
      changeAvailability(
        availability(),
        'original-fixture',
        'rollback',
        'c'.repeat(64),
      ),
    /retained/,
  );
  assert.throws(
    () => changeAvailability(availability(), 'original-fixture', 'activate'),
    /Only pause/,
  );
  const mismatch = availability();
  mismatch.titles[0].releases[1].saveSchemaVersion = 2;
  assert.throws(
    () =>
      changeAvailability(mismatch, 'original-fixture', 'rollback', previous),
    /migration/,
  );
  const duplicate = availability();
  duplicate.titles.push(structuredClone(duplicate.titles[0]));
  assert.throws(
    () => changeAvailability(duplicate, 'original-fixture', 'pause'),
    /Invalid title/,
  );
});

test('operator CLI preserves file on invalid update and prevents concurrent writers', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'akeru-availability-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'availability.json');
  const bytes = JSON.stringify(availability());
  writeFileSync(path, bytes);
  assert.throws(
    () => updateAvailabilityFile(path, 'missing', 'pause'),
    /Unknown/,
  );
  assert.equal(readFileSync(path, 'utf8'), bytes);
  updateAvailabilityFile(path, 'original-fixture', 'pause');
  assert.equal(JSON.parse(readFileSync(path)).titles[0].paused, true);
  writeFileSync(`${path}.lock`, '');
  assert.throws(
    () =>
      updateAvailabilityFile(path, 'original-fixture', 'rollback', previous),
    /EEXIST/,
  );
});
