import { createHash } from 'node:crypto';
import { validateManifest } from '../../packages/contracts/src/index.js';
import { validateCatalog } from './model.js';
const digest = (object) =>
  createHash('sha256').update(JSON.stringify(object)).digest('hex');
/** Operator-side compilation only. Titles cannot provide verifyPublication.
 * The trusted verifier must authenticate a live publication decision bound to
 * every supplied identity field, including origin and manifest bytes. Default denies.
 */
export async function createPublishedCatalog(
  candidates,
  { verifyPublication = async () => false, shellOrigin } = {},
) {
  if (
    !Array.isArray(candidates) ||
    candidates.length > 500 ||
    typeof verifyPublication !== 'function'
  )
    throw new Error('Invalid registry input');
  const entries = [];
  for (const candidate of candidates) {
    const copy = structuredClone(candidate);
    const result = validateManifest(copy.manifest);
    if (!result.valid)
      throw new Error(`Invalid package: ${result.errors.join('; ')}`);
    validateCatalog(
      { schemaVersion: '0.1.0', mode: 'production', entries: [copy] },
      { shellOrigin },
    );
    const request = Object.freeze({
      id: copy.manifest.id,
      version: copy.manifest.version,
      manifestDigest: digest(copy.manifest),
      releaseDigest: copy.release.digest,
      origin: copy.release.origin,
    });
    if ((await verifyPublication(request)) === true) entries.push(copy);
  }
  return validateCatalog(
    { schemaVersion: '0.1.0', mode: 'production', entries },
    { shellOrigin },
  );
}
