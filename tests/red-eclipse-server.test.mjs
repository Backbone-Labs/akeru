import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  allowedOrigins,
  upgradeAllowed,
} = require('../packages/red-eclipse/server/policy.cjs');
const origin = 'https://title.example.com';
test('Red Eclipse relay requires explicit exact HTTPS origins', () => {
  for (const value of [
    undefined,
    '',
    '*',
    'null',
    'http://title.example.com',
    'https://*.example.com',
    'https://title.example.com/path',
    'https://user:pass@title.example.com',
  ])
    assert.throws(() => allowedOrigins(value));
  assert.deepEqual([...allowedOrigins(origin)], [origin]);
});
test('Red Eclipse relay rejects cross-origin, destination injection, capacity and unready upgrades', () => {
  const origins = allowedOrigins(origin),
    valid = { ready: true, path: '/relay', origin, clients: 0 };
  assert.equal(upgradeAllowed(valid, origins), true);
  for (const patch of [
    { ready: false },
    { origin: undefined },
    { origin: 'null' },
    { origin: 'https://evil.example.com' },
    { path: '/relay?host=evil.example.com' },
    { path: '/other' },
    { clients: 8 },
  ])
    assert.equal(upgradeAllowed({ ...valid, ...patch }, origins), false);
});
test('Red Eclipse prepared Docker recipe cannot deploy or accept arbitrary source revisions', async () => {
  const source = await readFile(
    new URL(
      '../packages/red-eclipse/server/prepare-context.mjs',
      import.meta.url,
    ),
    'utf8',
  );
  const docker = await readFile(
    new URL('../packages/red-eclipse/server/Dockerfile', import.meta.url),
    'utf8',
  );
  assert.ok(!source.includes('execFile') && !source.includes('spawn('));
  assert.match(
    docker,
    /git fetch --depth=1 origin faf378d12558addc700d0e464e7e8c3a39fbceee/,
  );
  assert.match(
    docker,
    /npm ci --omit=dev --ignore-scripts --workspace=@akeru\/red-eclipse/,
  );
});

test('Red Eclipse server context includes native content sentinel and refuses overwrite', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const scratch = await mkdtemp(join(tmpdir(), 'red-server-context-'));
  try {
    const release = join(scratch, 'release'),
      output = join(scratch, 'output');
    await mkdir(join(release, 'data/maps'), { recursive: true });
    await mkdir(join(release, 'notices'));
    for (const path of [
      'CREDITS.md',
      'release-manifest.json',
      'notices/cc-by-sa.txt',
      'data/maps/readme.txt',
      'data/maps/fortitude.mpz',
      'data/maps/fortitude.cfg',
      'data/maps/fortitude.wpt',
    ])
      await writeFile(join(release, path), 'fixture');
    const script = new URL(
      '../packages/red-eclipse/server/prepare-context.mjs',
      import.meta.url,
    );
    execFileSync(process.execPath, [script.pathname, release, output]);
    assert.equal(
      await readFile(join(output, 'maps/readme.txt'), 'utf8'),
      'fixture',
    );
    assert.equal(
      await readFile(join(output, 'maps/fortitude.wpt'), 'utf8'),
      'fixture',
    );
    assert.throws(() =>
      execFileSync(process.execPath, [script.pathname, release, output], {
        stdio: 'pipe',
      }),
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
