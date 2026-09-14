import test from 'node:test';
import assert from 'node:assert/strict';
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
