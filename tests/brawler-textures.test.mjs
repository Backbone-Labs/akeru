import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preserveTextureSize } from '../packages/brawler-coop/mobile-textures.mjs';
test('mobile textures retain scene dimensions without changing encoded pixels', () => {
  const b = Buffer.alloc(64, 23);
  b.write('GST2');
  b.writeUInt32LE(1, 4);
  b.writeUInt32LE(256, 8);
  b.writeUInt32LE(128, 12);
  const out = preserveTextureSize(b, { width: 2048, height: 1024, limit: 256 });
  assert.equal(out.readUInt32LE(8), 2048);
  assert.equal(out.readUInt32LE(12), 1024);
  assert.deepEqual(out.subarray(16), b.subarray(16));
  assert.equal(b.readUInt32LE(8), 256);
  assert.throws(() =>
    preserveTextureSize(Buffer.alloc(64), {
      width: 2048,
      height: 1024,
      limit: 256,
    }),
  );
  assert.throws(() =>
    preserveTextureSize(b, { width: 2048, height: 1024, limit: 512 }),
  );
  b.writeUInt32LE(2, 4);
  assert.throws(() =>
    preserveTextureSize(b, { width: 2048, height: 1024, limit: 256 }),
  );
});
