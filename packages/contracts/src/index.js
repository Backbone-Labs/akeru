import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import semver from 'semver';
import schema from '../schema/akeru.schema.json' with { type: 'json' };
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export const SPEC_VERSION = '0.1.0';
export const SDK_VERSION = '0.1.0';
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const checkSchema = ajv.compile(schema);

/** Validate untrusted declarations only. Never returns host grants or publication approval. */
export function validateManifest(manifest, { sdkVersion = SDK_VERSION } = {}) {
  if (!checkSchema(manifest)) {
    return { valid: false, errors: checkSchema.errors.map(e => `${e.instancePath || '/'} ${e.message}`) };
  }
  const errors = [];
  if (semver.valid(manifest.version) !== manifest.version) errors.push('/version must be an exact semantic version');
  const range = semver.validRange(manifest.sdk.range);
  if (!range || !semver.valid(sdkVersion) || !semver.satisfies(sdkVersion, range)) {
    errors.push('/sdk/range must accept the selected host SDK version');
  }
  const paths = manifest.artifacts.map(a => a.path);
  if (new Set(paths).size !== paths.length) errors.push('/artifacts paths must be unique');
  if (!paths.includes(manifest.entry)) errors.push('/entry must name a hashed artifact');
  const assets = manifest.provenance.assets.map(a => a.path);
  if (new Set(assets).size !== assets.length) errors.push('/provenance/assets paths must be unique');
  if (assets.some(p => !paths.includes(p)) || paths.some(p => !assets.includes(p))) {
    errors.push('/provenance/assets must cover every artifact exactly once');
  }
  const urls = [manifest.provenance.source.url, ...manifest.provenance.assets.flatMap(a => a.evidence)];
  if (urls.some(value => {
    try {
      const u = new URL(value);
      return u.protocol !== 'https:' || !!u.username || !!u.password;
    } catch { return true; }
  })) {
    errors.push('/provenance URLs must use HTTPS without credentials');
  }
  const graphics = manifest.runtime.graphics;
  if (graphics.preferred !== 'webgpu' && graphics.fallback !== null) {
    errors.push('/runtime/graphics only WebGPU may declare a WebGL2 fallback');
  }
  if (manifest.runtime.requiredFeatures.some(f => manifest.runtime.optionalFeatures.includes(f))) {
    errors.push('/runtime features cannot be both required and optional');
  }
  if (!manifest.capabilities.includes('save.local')) errors.push('/capabilities must request save.local');
  const sync = manifest.capabilities.includes('save.account-sync');
  if (sync !== (manifest.saves.accountSync === 'optional')) errors.push('/saves/accountSync must match its capability request');
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
    if (!inside(root, manifestPath)) throw new Error('Manifest escapes package root');
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) { return { valid: false, errors: [`Cannot read manifest: ${error.message}`] }; }
  const result = validateManifest(manifest, options);
  if (!result.valid) return result;
  const errors = [];
  for (const artifact of manifest.artifacts) {
    try {
      const file = await realpath(resolve(root, artifact.path));
      if (!inside(root, file)) throw new Error('Artifact escapes package root');
      if (!(await stat(file)).isFile()) throw new Error('Artifact is not a regular file');
      const digest = createHash('sha256').update(await readFile(file)).digest('hex');
      if (digest !== artifact.sha256) errors.push(`${artifact.path}: SHA-256 mismatch`);
    } catch (error) { errors.push(`${artifact.path}: ${error.message}`); }
  }
  return { valid: errors.length === 0, errors };
}
function inside(root, file) {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path);
}

export { assertTitleAdapterV1 } from './reference-session.js';
