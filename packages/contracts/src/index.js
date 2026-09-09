import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import semver from 'semver';
import schema from '../schema/akeru.schema.json' with { type: 'json' };
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export const SPEC_VERSION = '0.1.0';
export const SDK_VERSION = '0.1.0';
// Limits apply before schema formats, uniqueness checks, parsing or hashing.
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;
const ajv = new Ajv({ allErrors: false, strict: true });
addFormats(ajv);
const checkSchema = ajv.compile(schema);

/** Validate untrusted declarations only. Never returns host grants or publication approval. */
export function validateManifest(manifest, { sdkVersion = SDK_VERSION } = {}) {
  if (!withinManifestBudget(manifest)) {
    return {
      valid: false,
      errors: ['Manifest exceeds structural or size limits'],
    };
  }
  if (!checkSchema(manifest)) {
    return {
      valid: false,
      errors: checkSchema.errors.map(
        (e) => `${e.instancePath || '/'} ${e.message}`,
      ),
    };
  }
  const errors = [];
  if (semver.valid(manifest.version) !== manifest.version)
    errors.push('/version must be an exact semantic version');
  const range = semver.validRange(manifest.sdk.range);
  if (
    !range ||
    !semver.valid(sdkVersion) ||
    !semver.satisfies(sdkVersion, range)
  ) {
    errors.push('/sdk/range must accept the selected host SDK version');
  }
  const paths = manifest.artifacts.map((a) => a.path);
  const pathSet = new Set(paths);
  if (pathSet.size !== paths.length)
    errors.push('/artifacts paths must be unique');
  if (!pathSet.has(manifest.entry))
    errors.push('/entry must name a hashed artifact');
  const assets = manifest.provenance.assets.map((a) => a.path);
  const assetSet = new Set(assets);
  if (assetSet.size !== assets.length)
    errors.push('/provenance/assets paths must be unique');
  if (
    assets.some((p) => !pathSet.has(p)) ||
    paths.some((p) => !assetSet.has(p))
  ) {
    errors.push('/provenance/assets must cover every artifact exactly once');
  }
  const urls = [
    manifest.provenance.source.url,
    ...manifest.provenance.assets.flatMap((a) => a.evidence),
  ];
  if (
    urls.some((value) => {
      try {
        const u = new URL(value);
        return u.protocol !== 'https:' || !!u.username || !!u.password;
      } catch {
        return true;
      }
    })
  ) {
    errors.push('/provenance URLs must use HTTPS without credentials');
  }
  const graphics = manifest.runtime.graphics;
  if (graphics.preferred !== 'webgpu' && graphics.fallback !== null) {
    errors.push('/runtime/graphics only WebGPU may declare a WebGL2 fallback');
  }
  if (
    manifest.runtime.requiredFeatures.some((f) =>
      manifest.runtime.optionalFeatures.includes(f),
    )
  ) {
    errors.push('/runtime features cannot be both required and optional');
  }
  if (!manifest.capabilities.includes('save.local'))
    errors.push('/capabilities must request save.local');
  const sync = manifest.capabilities.includes('save.account-sync');
  if (sync !== (manifest.saves.accountSync === 'optional'))
    errors.push('/saves/accountSync must match its capability request');
  return { valid: errors.length === 0, errors };
}

/** Read a local package, reject path/symlink escape and verify declared artifact bytes.
 * This is an offline integrity check, not a sandbox or an approval gate.
 */
export async function validatePackage(directory, options) {
  let root, manifest;
  try {
    root = await realpath(directory);
    const manifestPath = await realpath(resolve(root, 'akeru.json'));
    if (!inside(root, manifestPath))
      throw new Error('Manifest escapes package root');
    const bytes = [];
    await readBoundedFile(manifestPath, MAX_MANIFEST_BYTES, (chunk) =>
      bytes.push(chunk),
    );
    manifest = JSON.parse(Buffer.concat(bytes).toString('utf8'));
  } catch (error) {
    return { valid: false, errors: [`Cannot read manifest: ${error.message}`] };
  }
  const result = validateManifest(manifest, options);
  if (!result.valid) return result;
  const errors = [];
  let packageBytes = 0;
  for (const artifact of manifest.artifacts) {
    try {
      const file = await realpath(resolve(root, artifact.path));
      if (!inside(root, file)) throw new Error('Artifact escapes package root');
      const hash = createHash('sha256');
      packageBytes += await readBoundedFile(
        file,
        Math.min(MAX_ARTIFACT_BYTES, MAX_PACKAGE_BYTES - packageBytes),
        (chunk) => hash.update(chunk),
      );
      const digest = hash.digest('hex');
      if (digest !== artifact.sha256)
        errors.push(`${artifact.path}: SHA-256 mismatch`);
    } catch (error) {
      return { valid: false, errors: [`${artifact.path}: ${error.message}`] };
    }
  }
  return { valid: errors.length === 0, errors };
}
// Bound in-memory callers too, including cycles and excessive nesting. JSON files
// receive an independent byte cap before parsing. No recursive serialization.
function withinManifestBudget(manifest) {
  const pending = [{ value: manifest, depth: 0 }];
  let nodes = 0;
  let bytes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (++nodes > 32768 || depth > 12) return false;
    if (typeof value === 'string') {
      if (value.length > 2048) return false;
      bytes += Buffer.byteLength(value, 'utf8');
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length > 1024) return false;
        for (const child of value)
          pending.push({ value: child, depth: depth + 1 });
      } else {
        let keys = 0;
        for (const key in value) {
          if (!Object.hasOwn(value, key)) continue;
          if (++keys > 16 || key.length > 64) return false;
          bytes += Buffer.byteLength(key, 'utf8');
          pending.push({ value: value[key], depth: depth + 1 });
        }
      }
    }
    if (bytes > MAX_MANIFEST_BYTES) return false;
  }
  return true;
}

// Inspect and consume the same descriptor; never allocate an entire artifact.
// O_NONBLOCK also prevents a substituted FIFO from hanging before fstat.
async function readBoundedFile(file, limit, consume) {
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Not a regular file');
    if (info.size > limit) throw new Error('File exceeds size limit');
    let size = 0;
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      highWaterMark: 64 * 1024,
    })) {
      size += chunk.length;
      if (size > limit) throw new Error('File exceeds size limit');
      consume(chunk);
    }
    return size;
  } finally {
    await handle.close();
  }
}

function inside(root, file) {
  const path = relative(root, file);
  return (
    path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path)
  );
}

export { assertTitleAdapterV1 } from './reference-session.js';
