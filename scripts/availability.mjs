import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
function exactKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort())
  );
}
export function validateAvailability(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'generation', 'titles']) ||
    value.schemaVersion !== '1.0.0' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !Array.isArray(value.titles)
  )
    throw new Error('Invalid availability document');
  const ids = new Set();
  for (const title of value.titles) {
    if (
      !exactKeys(title, ['id', 'paused', 'current', 'releases']) ||
      typeof title.id !== 'string' ||
      !idPattern.test(title.id) ||
      ids.has(title.id) ||
      typeof title.paused !== 'boolean' ||
      typeof title.current !== 'string' ||
      !Array.isArray(title.releases)
    )
      throw new Error('Invalid title availability');
    ids.add(title.id);
    const digests = new Set();
    for (const release of title.releases) {
      if (
        !exactKeys(release, ['digest', 'version', 'saveSchemaVersion']) ||
        typeof release.digest !== 'string' ||
        !hashPattern.test(release.digest) ||
        digests.has(release.digest) ||
        typeof release.version !== 'string' ||
        !versionPattern.test(release.version) ||
        !Number.isSafeInteger(release.saveSchemaVersion) ||
        release.saveSchemaVersion < 1
      )
        throw new Error('Invalid retained release');
      digests.add(release.digest);
    }
    if (!digests.has(title.current))
      throw new Error('Current release must be retained');
  }
  return value;
}
// This operates on a trusted operator-owned record; it never accepts game messages.
// Retained releases must already have passed the separate publication workflow.
export function changeAvailability(document, titleId, action, targetDigest) {
  validateAvailability(document);
  const updated = structuredClone(document);
  const title = updated.titles.find((t) => t.id === titleId);
  if (!title) throw new Error('Unknown title');
  if (action === 'pause') {
    if (targetDigest !== undefined) throw new Error('Pause takes no target');
    if (title.paused) return updated;
    title.paused = true;
  } else if (action === 'rollback') {
    const target = title.releases.find((r) => r.digest === targetDigest);
    const current = title.releases.find((r) => r.digest === title.current);
    if (!target) throw new Error('Rollback requires a retained release digest');
    if (target.saveSchemaVersion !== current.saveSchemaVersion)
      throw new Error('Save schema differs; reviewed migration required');
    if (targetDigest === title.current) return updated;
    title.current = targetDigest;
    // A paused title stays paused. Rollback is not publication or reactivation.
  } else throw new Error('Only pause and rollback are supported');
  updated.generation += 1;
  return validateAvailability(updated);
}
export function updateAvailabilityFile(path, titleId, action, digest) {
  const absolute = resolve(path);
  const lock = `${absolute}.lock`;
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  let updated;
  const errors = [];
  try {
    updated = changeAvailability(
      JSON.parse(readFileSync(absolute)),
      titleId,
      action,
      digest,
    );
    writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, absolute);
  } catch (error) {
    errors.push(error);
  } finally {
    for (const file of [temporary, lock]) {
      try {
        unlinkSync(file);
      } catch (error) {
        if (error.code !== 'ENOENT') errors.push(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, 'Availability update or cleanup failed');
  return updated;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [path, id, action, digest, ...extra] = process.argv.slice(2);
    if (!path || !id || !action || extra.length)
      throw new Error(
        'Usage: node scripts/availability.mjs <operator-file> <title-id> pause|rollback [digest]',
      );
    console.log(
      JSON.stringify(updateAvailabilityFile(path, id, action, digest), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
