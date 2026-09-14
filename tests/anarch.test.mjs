import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputMask } from '../packages/anarch/src/input.js';
import { startCatalogDemo } from '../examples/catalog-demo/server.mjs';
test('Anarch touch and controller use equivalent portable inputs and release completely', () => {
  assert.equal(
    inputMask({ buttons: { up: 1, confirm: 1 } }),
    inputMask({ axes: { moveY: -1 }, buttons: { confirm: 1 } }),
  );
  assert.equal(
    inputMask({ buttons: { cancel: 1, left: 1 } }),
    (1 << 5) | (1 << 3),
  );
  assert.equal(
    inputMask({ buttons: { menu: 1, down: 1 } }),
    (1 << 6) | (1 << 2),
  );
  assert.equal(inputMask(), 0);
  assert.equal(
    inputMask({
      axes: { moveY: NaN, moveX: Infinity },
      buttons: { confirm: 'yes' },
    }),
    0,
  );
});
test('local WASM option leaves standard preview policy restricted and paths isolated', async () => {
  const demo = await startCatalogDemo();
  try {
    const catalog = await (await fetch(demo.url + '/catalog.json')).json();
    assert.equal(catalog.mode, 'demo');
    const entry = catalog.entries[0];
    const title = await fetch(
      demo.titleOrigin + '/releases/' + entry.release.digest + '/title.html',
    );
    assert.ok(
      !title.headers
        .get('content-security-policy')
        .includes('wasm-unsafe-eval'),
    );
    assert.match(
      title.headers.get('content-security-policy'),
      /connect-src 'none'/,
    );
    assert.equal(
      (
        await fetch(
          demo.titleOrigin +
            '/releases/' +
            entry.release.digest +
            '/../title.html',
        )
      ).status,
      404,
    );
    assert.equal(
      (await fetch(demo.url + '/dist/anarch/engine.wasm')).status,
      404,
    );
  } finally {
    await demo.close();
  }
});

test('Anarch preview rejects modified, additional and symlinked build artifacts', async () => {
  const { mkdtempSync, writeFileSync, rmSync, symlinkSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const { readBuiltTitle } = await import('../packages/anarch/artifacts.mjs');
  const dir = mkdtempSync(tmpdir() + '/anarch-artifacts-');
  const url = pathToFileURL(dir + '/');
  try {
    writeFileSync(dir + '/engine.js', 'fixture');
    writeFileSync(
      dir + '/build-record.json',
      JSON.stringify({
        artifacts: [
          {
            path: 'engine.js',
            sha256: createHash('sha256').update('fixture').digest('hex'),
          },
        ],
      }),
    );
    assert.equal(readBuiltTitle(url)['engine.js'].toString(), 'fixture');
    writeFileSync(dir + '/engine.js', 'changed');
    assert.throws(() => readBuiltTitle(url), /changed/);
    writeFileSync(dir + '/extra.js', 'extra');
    assert.throws(() => readBuiltTitle(url), /Unexpected/);
    rmSync(dir + '/extra.js');
    rmSync(dir + '/engine.js');
    symlinkSync('build-record.json', dir + '/engine.js');
    assert.throws(() => readBuiltTitle(url), /regular/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
