import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const policy = JSON.parse(await readFile(new URL('../compliance/policy.v1.json', import.meta.url), 'utf8'));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}([a-f0-9]{24})?$/.test(value);
const digest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const https = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z', '.000Z');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

/** Binds recorded approval to all dossier fields except the approval itself. */
export function dossierDigest(dossier) {
  const { approval: _approval, ...content } = dossier;
  return `sha256:${createHash('sha256').update(canonical(content)).digest('hex')}`;
}

/** Validate evidence records, not truth, reviewer authority or deployment eligibility. */
export function validateDossier(dossier) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const keys = (value, expected, path) => {
    if (!object(value)) { errors.push(`${path}: expected object`); return false; }
    for (const key of expected) check(Object.hasOwn(value, key), `${path}.${key}: required`);
    for (const key of Object.keys(value)) check(expected.includes(key), `${path}.${key}: unknown field`);
    return true;
  };
  const urls = (value, path, required = false) => {
    check(Array.isArray(value) && (!required || value.length > 0) && value.every(https), `${path}: expected ${required ? 'nonempty ' : ''}HTTPS evidence list`);
  };
  const review = (value, path) => {
    if (!keys(value, ['reviewer', 'reviewedAt', 'evidenceUrls'], path)) return;
    check(text(value.reviewer), `${path}.reviewer: accountable reviewer required`);
    check(timestamp(value.reviewedAt), `${path}.reviewedAt: UTC timestamp required`);
    urls(value.evidenceUrls, `${path}.evidenceUrls`, true);
  };
  if (!keys(dossier, ['schemaVersion', 'id', 'title', 'creatorTier', 'scope', 'policy', 'identity', 'release', 'sections', 'approval'], 'dossier')) return errors;
  check(dossier.schemaVersion === 1, 'schemaVersion: unsupported');
  check(typeof dossier.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dossier.id), 'id: stable slug required');
  check(text(dossier.title), 'title: required');
  check(['backbone', 'indie', 'community'].includes(dossier.creatorTier), 'creatorTier: unsupported');
  check(['candidate', 'optional', 'future'].includes(dossier.scope), 'scope: unsupported');
  if (keys(dossier.policy, ['id', 'revision'], 'policy')) {
    check(dossier.policy.id === policy.id && dossier.policy.revision === policy.revision, 'policy: unsupported identity or revision');
  }
  if (keys(dossier.identity, ['status', 'upstreamUrl', 'observedRevision', 'note'], 'identity')) {
    check(['candidate', 'confirmed'].includes(dossier.identity.status), 'identity.status: unsupported');
    check(https(dossier.identity.upstreamUrl), 'identity.upstreamUrl: HTTPS source required');
    check(sha(dossier.identity.observedRevision), 'identity.observedRevision: full immutable Git commit required');
    check(text(dossier.identity.note), 'identity.note: edition and selection context required');
  }
  if (dossier.release !== null && keys(dossier.release, ['version', 'artifactDigest', 'sources'], 'release')) {
    check(typeof dossier.release.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(dossier.release.version), 'release.version: stable semantic version required');
    check(digest(dossier.release.artifactDigest), 'release.artifactDigest: SHA-256 required');
    check(Array.isArray(dossier.release.sources) && dossier.release.sources.length > 0, 'release.sources: source inventory required');
    if (Array.isArray(dossier.release.sources)) for (const [index, source] of dossier.release.sources.entries()) {
      const path = `release.sources[${index}]`;
      if (keys(source, ['url', 'revision', 'role'], path)) {
        check(https(source.url), `${path}.url: HTTPS source required`);
        check(sha(source.revision), `${path}.revision: full immutable Git commit required`);
        check(['game', 'engine', 'patches', 'assets', 'build'].includes(source.role), `${path}.role: unsupported`);
      }
    }
    check(Array.isArray(dossier.release.sources) && dossier.release.sources.some((source) =>
      source?.url === dossier.identity?.upstreamUrl && ['game', 'assets'].includes(source?.role)), 'release.sources: candidate upstream must be represented');
  }
  const sectionNames = Object.keys(policy.requiredSections);
  if (keys(dossier.sections, sectionNames, 'sections')) for (const name of sectionNames) {
    const section = dossier.sections[name];
    const path = `sections.${name}`;
    if (!keys(section, ['status', 'finding', 'evidenceUrls', 'missingEvidence', 'review'], path)) continue;
    check(['unknown', 'in-review', 'complete'].includes(section.status), `${path}.status: unsupported`);
    check(text(section.finding), `${path}.finding: required`);
    urls(section.evidenceUrls, `${path}.evidenceUrls`, section.status === 'complete');
    check(Array.isArray(section.missingEvidence) && section.missingEvidence.every(text), `${path}.missingEvidence: expected text list`);
    if (section.status === 'complete') {
      check(Array.isArray(section.missingEvidence) && section.missingEvidence.length === 0, `${path}: unresolved evidence cannot be complete`);
      review(section.review, `${path}.review`);
    } else {
      check(Array.isArray(section.missingEvidence) && section.missingEvidence.length > 0, `${path}: record missing evidence`);
      check(section.review === null, `${path}: incomplete section cannot carry completed review`);
    }
  }
  if (keys(dossier.approval, ['status', 'review', 'reviewedContentDigest'], 'approval')) {
    check(['pending', 'approved', 'rejected'].includes(dossier.approval.status), 'approval.status: explicit decision required');
    if (dossier.approval.status === 'pending') {
      check(dossier.approval.review === null && dossier.approval.reviewedContentDigest === null, 'approval: pending must not carry a decision');
    } else {
      review(dossier.approval.review, 'approval.review');
      check(digest(dossier.approval.reviewedContentDigest) && dossier.approval.reviewedContentDigest === dossierDigest(dossier), 'approval: decision is missing or stale for this content');
      if (dossier.approval.status === 'approved') {
        check(dossier.identity?.status === 'confirmed', 'approval: source identity not confirmed');
        check(dossier.release !== null, 'approval: exact release required');
        check(sectionNames.every((name) => dossier.sections?.[name]?.status === 'complete'), 'approval: every required section must be complete');
      }
    }
  }
  return errors;
}

/** Necessary evidence check only. A trusted publication service must separately authorize. */
export function publicationEvidenceErrors(dossier) {
  const errors = validateDossier(dossier);
  if (dossier?.approval?.status !== 'approved') errors.push('publication evidence: no recorded approval');
  return errors;
}

export function validateCandidateList(dossiers) {
  if (!Array.isArray(dossiers) || dossiers.length === 0) return ['candidate list: expected nonempty array'];
  const seen = new Set();
  return dossiers.flatMap((dossier, index) => {
    const errors = validateDossier(dossier).map((error) => `[${index}] ${error}`);
    if (seen.has(dossier?.id)) errors.push(`[${index}] duplicate candidate id`);
    seen.add(dossier?.id);
    return errors;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const candidates = JSON.parse(await readFile(new URL('../compliance/candidates.json', import.meta.url), 'utf8'));
  const errors = validateCandidateList(candidates);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Validated ${candidates.length} evidence records. This does not authorize publication.`);
}
