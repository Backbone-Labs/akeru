import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import {
  BASELINE_ASSETS,
  copyBaselineAssets,
  patchBaselineApp,
  httpsOrigin,
} from '../scripts/package-multiplayer-preview.mjs';

test('multiplayer shell patch preserves native menu gates and loading flow; unknown layouts fail closed', () => {
  const original = `export function mountCatalog({
  inputProviderFactory,
}) {
  const revealMs = 3500;
  function bindInput(id) {
      input = inputProviderFactory({ titleId: id });
      if (!hasNativeMenuHost()) pause();
  }
  channel({
      saveService: savesFor(entry).service,
      presentation: isPlayer() ? 'embedded' : 'web',
  });
}`;
  const patched = patchBaselineApp(original);
  assert.ok(patched.includes('if (!hasNativeMenuHost()) pause();'));
  assert.ok(patched.includes('const revealMs = 3500;'));
  assert.ok(patched.includes("presentation: isPlayer() ? 'embedded' : 'web'"));
  assert.equal((patched.match(/multiplayerService: /g) || []).length, 1);
  assert.throws(() => patchBaselineApp(patched), /anchor changed/);
  assert.throws(
    () =>
      patchBaselineApp(
        original.replace(
          'saveService: savesFor(entry).service',
          'saveService: anotherService',
        ),
      ),
    /anchor changed/,
  );
});
test('baseline copying uses allowlisted regular assets and catalog covers, excluding hidden files and unlisted secrets', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'akeru-bundle-test-'));
  const baseline = resolve(root, 'baseline'),
    out = resolve(root, 'out');
  try {
    for (const path of BASELINE_ASSETS) {
      mkdirSync(dirname(resolve(baseline, path)), { recursive: true });
      writeFileSync(resolve(baseline, path), `public:${path}`);
    }
    const manifest = JSON.parse(
      readFileSync(
        new URL('../examples/contract-fixture/akeru.json', import.meta.url),
      ),
    );
    const catalog = {
      schemaVersion: '0.1.0',
      mode: 'demo',
      entries: [
        {
          manifest,
          release: {
            digest: 'a'.repeat(64),
            origin: 'https://fixture.example.com',
          },
          availability: 'available',
          metadata: {
            summary: 'Original fixture',
            description: 'A synthetic fixture.',
            category: 'sandbox',
            creator: 'Test',
            ageLabel: 'Test fixture',
            controls: { controller: ['Move'], touch: ['Tap'] },
            privacy: ['No requests'],
            notices: [{ label: 'License', url: 'https://example.com/license' }],
            cover: '/previews/orbit-study.png',
          },
        },
      ],
    };
    writeFileSync(resolve(baseline, 'catalog.json'), JSON.stringify(catalog));
    mkdirSync(resolve(baseline, 'previews'));
    writeFileSync(
      resolve(baseline, 'previews/orbit-study.png'),
      'public artwork',
    );
    writeFileSync(resolve(baseline, '.env.local'), 'never-read-or-copy');
    writeFileSync(resolve(baseline, 'credentials.json'), 'never-read-or-copy');
    symlinkSync(
      resolve(root, 'missing-private-target'),
      resolve(baseline, '.private'),
    );
    const result = copyBaselineAssets(baseline, out);
    assert.equal(result.files.length, BASELINE_ASSETS.length + 1);
    assert.deepEqual(result.catalog, catalog);
    assert.equal(
      readFileSync(resolve(out, 'previews/orbit-study.png'), 'utf8'),
      'public artwork',
    );
    assert.equal(existsSync(resolve(out, '.env.local')), false);
    assert.equal(existsSync(resolve(out, 'credentials.json')), false);
    assert.ok(readdirSync(out).every((name) => !name.startsWith('.')));
    rmSync(resolve(baseline, 'app.js'));
    symlinkSync(resolve(baseline, 'home.js'), resolve(baseline, 'app.js'));
    assert.throws(
      () => copyBaselineAssets(baseline, resolve(root, 'blocked')),
      /regular file/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('network and frame origins cannot smuggle credentials, paths, insecure transport or CSP directives', () => {
  assert.equal(
    httpsOrigin('https://network.example.com'),
    'https://network.example.com',
  );
  for (const origin of [
    'http://network.example.com',
    'https://user:secret@network.example.com',
    'https://network.example.com/path',
    'https://network.example.com?q=1',
    'https://network.example.com#hash',
    'https://network.example.com;script-src *',
  ])
    assert.throws(() => httpsOrigin(origin));
});
