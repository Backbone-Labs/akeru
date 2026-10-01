import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
// Web-only imports. Preserve logical dimensions so scene positions, animation
// frames and hitboxes do not change when the uploaded texture becomes smaller.
export function prepareMobileTextures(work) {
  const textures = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.godot') continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.png.import')) {
        const png = readFileSync(path.slice(0, -7));
        if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
          throw Error('Expected PNG source');
        const width = png.readUInt32BE(16),
          height = png.readUInt32BE(20);
        const limit = relative(work, path).startsWith('characters/')
          ? 256
          : 1024;
        if (Math.max(width, height) <= limit) continue;
        const config = readFileSync(path, 'utf8');
        const dest = config.match(/^path="res:\/\/([^"\n]+\.ctex)"/m)?.[1];
        if (
          !dest ||
          !config.includes('compress/mode=0') ||
          !config.includes('process/size_limit=0')
        )
          throw Error('Unexpected texture import format');
        writeFileSync(
          path,
          config.replace('process/size_limit=0', `process/size_limit=${limit}`),
        );
        textures.push({ path: resolve(work, dest), width, height, limit });
      }
    }
  }
  visit(work);
  return textures;
}
export function preserveTextureSize(bytes, { width, height, limit }) {
  // Godot 4.7.2 GST2 v1: logical width/height at 8/12; encoded image starts
  // after the 36-byte header. The engine applies texture_set_size_override.
  if (
    bytes.length < 48 ||
    bytes.toString('ascii', 0, 4) !== 'GST2' ||
    bytes.readUInt32LE(4) !== 1
  )
    throw Error('Unsupported compiled texture format');
  const w = bytes.readUInt32LE(8),
    h = bytes.readUInt32LE(12);
  if (
    ![width, height, limit].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 32768,
    ) ||
    Math.max(w, h) !== limit ||
    w > width ||
    h > height
  )
    throw Error('Unexpected imported texture dimensions');
  const result = Buffer.from(bytes);
  result.writeUInt32LE(width, 8);
  result.writeUInt32LE(height, 12);
  return result;
}
export function finishMobileTextures(textures) {
  let originalPixels = 0,
    uploadedPixels = 0;
  for (const texture of textures) {
    const bytes = readFileSync(texture.path);
    originalPixels += texture.width * texture.height;
    uploadedPixels += bytes.readUInt32LE(8) * bytes.readUInt32LE(12);
    writeFileSync(texture.path, preserveTextureSize(bytes, texture));
  }
  return { count: textures.length, originalPixels, uploadedPixels };
}
