import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCatalogDemo } from '../examples/catalog-demo/server.mjs';
import {
  controllerIdentity,
  needsOnboarding,
} from '../platform/catalog/onboarding.js';
test('recognition uses supported provider controllers without guessing a brand', () => {
  assert.equal(controllerIdentity([], [{ id: 'Backbone Pro' }]), null);
  assert.equal(
    controllerIdentity([{ index: 0 }], [{ id: 'Xbox Wireless Controller' }]),
    'Controller',
  );
  assert.equal(
    controllerIdentity(
      [{ index: 1 }],
      [null, { id: 'Backbone Pro (Vendor: 358a)' }],
    ),
    'Backbone',
  );
  assert.equal(
    controllerIdentity([{ index: 0 }], [{ id: 'NotBackbone' }]),
    'Controller',
  );
  assert.equal(controllerIdentity([{ index: 0 }], []), 'Controller');
});
test('first run works when browser storage is absent or denied', () => {
  assert.equal(needsOnboarding(null), true);
  assert.equal(
    needsOnboarding({
      getItem() {
        throw new Error('denied');
      },
    }),
    true,
  );
  assert.equal(needsOnboarding({ getItem: () => 'complete' }), false);
  assert.equal(needsOnboarding({ getItem: () => 'other' }), true);
});
test('local model serving rejects a substituted symbolic link before opening servers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'akeru-model-'));
  try {
    const target = join(directory, 'target.glb');
    const link = join(directory, 'model.glb');
    writeFileSync(target, 'model bytes');
    symlinkSync(target, link);
    await assert.rejects(
      startCatalogDemo({ controllerModelPath: link }),
      /Expected regular file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
