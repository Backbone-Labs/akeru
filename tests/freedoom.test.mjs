import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { inputMask } from '../packages/freedoom/src/input.js';
import { createDesktopInput } from '../packages/freedoom/src/desktop.js';
import { freedoomOptions } from '../packages/freedoom/catalog.mjs';
import { startCatalogDemo } from '../examples/catalog-demo/server.mjs';
test('Freedoom controller and touch inputs agree and reject invalid values', () => {
  assert.equal(
    inputMask({ buttons: { up: 1, confirm: 1 } }),
    inputMask({ axes: { moveY: -1 }, buttons: { rightTrigger: 1 } }),
  );
  assert.equal(
    inputMask({ axes: { moveX: -1, lookX: 1 }, buttons: { cancel: 1 } }),
    (1 << 10) | (1 << 7) | (1 << 8),
  );
  assert.equal(
    inputMask({
      axes: { moveY: NaN, lookX: Infinity },
      buttons: { confirm: '1' },
    }),
    0,
  );
  assert.equal(inputMask(), 0);
});
test('Freedoom desktop quick taps survive a frame and blur releases movement and fire', () => {
  const input = createDesktopInput();
  input.key('KeyW', true, 0);
  input.key('KeyW', false, 1);
  assert.equal(input.read(2).mask, 1 << 4);
  assert.equal(input.read(100).mask, 0);
  input.key('KeyA', true);
  input.fire(true);
  input.move(200, 0);
  input.release();
  assert.deepEqual(input.read(0), { mask: 0, x: 0, y: 0 });
  assert.equal(input.key('F8', true), false);
});
test('Freedoom local factory rejects unrecognized title and does not grant publication', async () => {
  assert.throws(() => freedoomOptions('../freedoom1'), /Unknown/);
  assert.throws(() => freedoomOptions('doom2'), /Unknown/);
  if (
    !existsSync(new URL('../dist/freedoom1/build-record.json', import.meta.url))
  )
    return;
  const option = freedoomOptions('freedoom1');
  assert.equal(option.manifest.provenance.source.rightsStatus, 'unknown');
  assert.deepEqual(option.manifest.capabilities, ['save.local']);
  const demo = await startCatalogDemo(option);
  try {
    const catalog = await (await fetch(demo.url + '/catalog.json')).json();
    assert.equal(catalog.mode, 'demo');
    const response = await fetch(
      demo.titleOrigin +
        '/releases/' +
        catalog.entries[0].release.digest +
        '/index.html',
    );
    assert.match(
      response.headers.get('content-security-policy'),
      /connect-src 'self'/,
    );
    assert.equal(
      (await fetch(demo.url + '/dist/freedoom1/game.wad')).status,
      404,
    );
    assert.equal(
      (
        await fetch(
          demo.titleOrigin +
            '/releases/' +
            catalog.entries[0].release.digest +
            '/../freedoom2/game.wad',
        )
      ).status,
      404,
    );
  } finally {
    await demo.close();
  }
});
