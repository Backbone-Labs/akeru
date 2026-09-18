import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validSave,
  restore,
  snapshot,
} from '../packages/wasm-desktop-preview/saves.js';
test('desktop title saves reject traversal, duplicate files, oversized data and foreign fields', () => {
  const file = { path: 'profile1/worlds/main.stsg', data: 'aGVsbG8=' };
  assert.equal(validSave({ files: [file] }), true);
  for (const path of [
    '/config',
    '../config',
    'profile/../../config',
    'a//b',
    'a/./b',
    'a\\b',
  ])
    assert.equal(validSave({ files: [{ ...file, path }] }), false);
  for (const value of [
    { files: [file, file] },
    { files: [{ ...file, data: '%%%' }] },
    { files: [{ ...file, data: 'a'.repeat(131076) }] },
    { files: [], token: 'secret' },
    { files: Array(129).fill(file) },
    null,
  ])
    assert.equal(validSave(value), false);
  let wrote = false;
  assert.throws(
    () =>
      restore(
        {
          mkdirTree() {
            wrote = true;
          },
        },
        '/private',
        { files: [{ ...file, path: '../other-title' }] },
      ),
    /Invalid/,
  );
  assert.equal(wrote, false);
});
test('snapshots skip symlinks and transient logs rather than following outside title storage', () => {
  const fs = {
    analyzePath: () => ({ exists: true }),
    readdir: () => ['.', '..', 'config', 'stdout.log', 'link'],
    lstat: (path) => ({
      mode: path.endsWith('link') ? 'link' : 'file',
      size: 2,
    }),
    isDir: () => false,
    isFile: (m) => m === 'file',
    readFile: () => new Uint8Array([65, 66]),
  };
  assert.deepEqual(snapshot(fs, '/private'), {
    files: [{ path: 'config', data: 'QUI=' }],
  });
});

test('threaded local preview scopes worker and isolation policy without weakening standard previews', async () => {
  const { startCatalogDemo } =
    await import('../examples/catalog-demo/server.mjs');
  for (const threaded of [false, true]) {
    const demo = await startCatalogDemo({ threaded });
    try {
      const shell = await fetch(demo.url);
      assert.equal(
        shell.headers.get('cross-origin-opener-policy'),
        threaded ? 'same-origin' : null,
      );
      const catalog = await (await fetch(demo.url + '/catalog.json')).json(),
        entry = catalog.entries[0];
      const response = await fetch(
        entry.release.origin +
          '/releases/' +
          entry.release.digest +
          '/' +
          entry.manifest.entry,
      );
      const csp = response.headers.get('content-security-policy');
      assert.equal(csp.includes("worker-src 'self' blob:"), threaded);
      assert.equal(csp.includes("'unsafe-eval'"), false);
      assert.equal(csp.includes("'unsafe-inline'"), false);
      assert.equal(
        response.headers.get('cross-origin-embedder-policy'),
        threaded ? 'require-corp' : null,
      );
    } finally {
      await demo.close();
    }
  }
});

test('public source scanner distinguishes the fixed Emscripten virtual user from real account paths', async () => {
  const { inspectPublicFile } =
    await import('../scripts/check-public-tree.mjs');
  assert.deepEqual(
    inspectPublicFile(
      'packages/wasm-desktop-preview/runtime.js',
      '/home/web_user/.local/share/supertux2/',
    ),
    [],
  );
  assert.ok(inspectPublicFile('unrelated.js', '/home/web_user/.local/').length);
  for (const value of ['home', 'Users'].map((root) =>
    ['', root, 'real-user', 'private', ''].join('/'),
  ))
    assert.ok(inspectPublicFile('runtime.js', value).length);
});
