import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dossierDigest, policy, publicationEvidenceErrors, validateCandidateList, validateDossier } from '../scripts/validate-compliance.mjs';

const candidates = JSON.parse(await readFile(new URL('../compliance/candidates.json', import.meta.url), 'utf8'));
const draft = () => structuredClone(candidates[0]);
// Synthetic evidence exercises structure only; never exported as a real approval.
const review = () => ({ reviewer: 'synthetic-test-reviewer', reviewedAt: '2026-09-09T12:00:00Z', evidenceUrls: ['https://example.org/synthetic-review'] });
function completed() {
  const dossier = draft();
  dossier.identity.status = 'confirmed';
  dossier.release = { version: '1.0.0', artifactDigest: `sha256:${'a'.repeat(64)}`, sources: [{ url: dossier.identity.upstreamUrl, revision: dossier.identity.observedRevision, role: 'game' }] };
  for (const section of Object.values(dossier.sections)) {
    Object.assign(section, { status: 'complete', evidenceUrls: ['https://example.org/synthetic-evidence'], missingEvidence: [], review: review() });
  }
  dossier.approval = { status: 'approved', review: review(), reviewedContentDigest: dossierDigest(dossier) };
  return dossier;
}

test('all 11 candidate dossiers validate but none has publication evidence', () => {
  assert.equal(candidates.length, 11);
  assert.deepEqual(validateCandidateList(candidates), []);
  for (const dossier of candidates) {
    assert.equal(dossier.approval.status, 'pending');
    assert.notDeepEqual(publicationEvidenceErrors(dossier), []);
  }
  assert.equal(candidates.find((dossier) => dossier.id === '2048').scope, 'optional');
  assert.equal(candidates.find((dossier) => dossier.id === 'hypersomnia').scope, 'future');
});

test('synthetic complete record validates without granting permissions', () => {
  assert.deepEqual(publicationEvidenceErrors(completed()), []);
  for (const tier of ['backbone', 'indie', 'community']) {
    const dossier = draft(); dossier.creatorTier = tier;
    assert.deepEqual(validateDossier(dossier), []);
    assert.notDeepEqual(publicationEvidenceErrors(dossier), []);
  }
});

test('approval requires confirmed source, release, completed sections and accountable evidence', () => {
  const mutations = [
    (d) => { delete d.approval; },
    (d) => { d.identity.status = 'candidate'; },
    (d) => { d.release = null; },
    (d) => { d.sections.assets.status = 'unknown'; },
    (d) => { d.sections.assets.missingEvidence = ['Music rights unresolved']; },
    (d) => { d.sections.assets.evidenceUrls = []; },
    (d) => { d.sections.assets.review = null; },
    (d) => { d.sections.assets.review.reviewer = ' '; },
    (d) => { d.approval.review.evidenceUrls = []; },
    (d) => { d.approval.review.reviewedAt = '2026-02-31T12:00:00Z'; },
  ];
  for (const mutate of mutations) {
    const dossier = completed(); mutate(dossier);
    if (dossier.approval) dossier.approval.reviewedContentDigest = dossierDigest(dossier);
    assert.notDeepEqual(publicationEvidenceErrors(dossier), []);
  }
});

test('unknown, omitted or misspelled required sections fail closed', () => {
  for (const key of Object.keys(policy.requiredSections)) {
    const dossier = draft(); delete dossier.sections[key];
    assert.notDeepEqual(validateDossier(dossier), []);
  }
  const dossier = draft(); dossier.sections.licensing = dossier.sections.code;
  assert.match(validateDossier(dossier).join('\n'), /unknown field/);
});

test('floating pins, insecure sources and malformed release identities fail', () => {
  for (const revision of ['main', 'v1.0.0', 'abc1234', 'A'.repeat(40), null]) {
    const dossier = draft(); dossier.identity.observedRevision = revision;
    assert.notDeepEqual(validateDossier(dossier), []);
  }
  for (const mutate of [
    (d) => { d.identity.upstreamUrl = 'http://example.org/source'; },
    (d) => { d.identity.upstreamUrl = 'https://user:secret@example.org/source'; },
    (d) => { d.release.sources[0].revision = 'latest'; },
    (d) => { d.release.sources = []; },
    (d) => { d.release.sources[0].url = 'https://example.org/different-title'; },
    (d) => { d.release.artifactDigest = 'sha256:abc'; },
    (d) => { d.release.version = '01.0.0'; },
  ]) {
    const dossier = completed(); mutate(dossier);
    dossier.approval.reviewedContentDigest = dossierDigest(dossier);
    assert.notDeepEqual(validateDossier(dossier), []);
  }
});

test('changing release, source, evidence or policy invalidates recorded decision', () => {
  for (const mutate of [
    (d) => { d.release.artifactDigest = `sha256:${'b'.repeat(64)}`; },
    (d) => { d.identity.observedRevision = 'b'.repeat(40); },
    (d) => { d.sections.assets.finding = 'New asset included'; },
    (d) => { d.sections.assets.review.reviewer = 'different-reviewer'; },
    (d) => { d.policy.revision += 1; },
  ]) {
    const dossier = completed(); mutate(dossier);
    assert.match(validateDossier(dossier).join('\n'), /stale/);
  }
});

test('source and evidence URLs reject coercible non-string values', () => {
  for (const mutate of [
    (d) => { d.identity.upstreamUrl = [d.identity.upstreamUrl]; },
    (d) => { d.release.sources[0].url = [d.release.sources[0].url]; },
    (d) => { d.sections.assets.evidenceUrls = [['https://example.org/evidence']]; },
    (d) => { d.sections.assets.review.evidenceUrls = [['https://example.org/review']]; },
    (d) => { d.approval.review.evidenceUrls = [['https://example.org/review']]; },
  ]) {
    const dossier = completed(); mutate(dossier);
    dossier.approval.reviewedContentDigest = dossierDigest(dossier);
    assert.notDeepEqual(validateDossier(dossier), []);
  }
});

test('pending, rejected and unsupported policies do not become approval by default', () => {
  const dossier = draft(); dossier.approval.status = 'rejected';
  dossier.approval.review = review(); dossier.approval.reviewedContentDigest = dossierDigest(dossier);
  assert.deepEqual(validateDossier(dossier), []);
  assert.notDeepEqual(publicationEvidenceErrors(dossier), []);
  dossier.policy.revision = 999;
  assert.notDeepEqual(validateDossier(dossier), []);
  dossier.approval.status = 'published';
  assert.notDeepEqual(publicationEvidenceErrors(dossier), []);
});

test('malformed records and duplicate identities return errors', () => {
  for (const value of [null, [], {}, { approval: true }]) assert.notDeepEqual(validateDossier(value), []);
  assert.notDeepEqual(validateCandidateList([draft(), draft()]), []);
  assert.notDeepEqual(validateCandidateList([]), []);
  const dossier = draft(); dossier.release = { sources: [null] };
  assert.notDeepEqual(validateDossier(dossier), []);
});

test('digest is independent of object insertion order', () => {
  const dossier = draft(); const reordered = Object.fromEntries(Object.entries(dossier).reverse());
  assert.equal(dossierDigest(dossier), dossierDigest(reordered));
});
