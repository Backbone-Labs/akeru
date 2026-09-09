# Hosting, provenance and releases

## Implemented in this PR

`npm run check` builds available workspace packages, runs Node tests and checks
tracked source for selected private-path/credential patterns. CI uses pinned
action commits, Node and npm, runs dependency auditing, then packages sources.

`npm run package:source` requires a clean checkout. It archives the committed
revision and records source URL, toolchain, each source-file hash, and the archive
hash in `dist/source/provenance.json`. It rejects symlinks, submodules and known
private/credential paths. Two builds of the same fixture revision are tested for
identical output. This is source provenance, not a signed production attestation,
a game build, or proof of reproducibility across different toolchains.

CI retains the source archive for 14 days as build evidence. Long-term public
corresponding-source distribution must be part of each production release;
temporary CI artifacts do not satisfy that operational requirement by themselves.

## Reproducible staging artifact and preview

`npm run package:staging` creates a static, empty staging shell from committed
source, with the visible source revision, platform license, downloadable source
archive, provenance and an exact file/digest manifest. It requires a clean
checkout and uses the same pinned toolchain. It does not include games.

`npm run preview:staging` verifies every allowlisted file before listening on
loopback port 4173. Extra files, symlinks, changed bytes and mismatched source
provenance fail closed. The HTTP server serves only the verified in-memory
files, rejects unsupported methods, and exposes `/healthz` with revision and
release-manifest digest. Its strict shell CSP blocks scripts, frames, workers
and connections; this deliberately empty shell policy is not a title policy.
No production HSTS claim is made by a local HTTP preview. The deployment adapter
must supply HTTPS and preserve these headers. CI retains both source and staging
artifacts; their hashes provide integrity evidence, not authenticated signatures.

## Operator pause and rollback primitive

`node scripts/availability.mjs <operator-file> <title-id> pause` updates a trusted
local availability record atomically. `rollback <sha256>` selects only a retained
release with the same save schema. A paused title stays paused; the tool cannot
activate a title, accept a new artifact, or approve a release. Concurrent cooperating
writers are excluded with a lock file. After an interrupted writer, an operator
must verify no writer remains before removing its stale `.lock` file.

The record has schemaVersion `1.0.0`, an integer generation and a titles array.
Each title has id, paused, current (SHA-256 release digest), and releases; each
retained release has digest, version (three-part semantic version), and
saveSchemaVersion (positive integer). A reference example lives in the tests.
Only a trusted publisher may create this file and retain the corresponding
immutable bytes. The CLI is not an authenticated registry or public HTTP endpoint.

The hosting integration must load the resulting record for new launches, serve
availability with a maximum 60-second freshness window and no stale fallback,
and reject unavailable metadata. Existing sessions continue during normal pause.
This consumer/cache behavior remains a deployment integration acceptance check;
the local state-change tests alone do not establish a working hosted kill switch.

## Hosting integration still required

Use an owned HTTPS catalog origin and isolated stable title origins. Cloudflare
delivery with object storage is a candidate; account, DNS, cost and identity
wiring remain to be verified. The product brief proposes `play.backbone.com/g/<id>`;
this document does not provision or assert ownership of that hostname.

Separate immutable game artifacts from mutable catalog/availability metadata.
The former can have long cache lifetimes; the latter needs bounded freshness,
explicit staged rollout and a source-linked previous version. A native cached
tile must not bypass the destination's check before a new launch.

Before deploying, specify and test:

- Shell and title CSP, frame permissions, outbound hosts and redirect policy.
- Title origin/storage boundaries, parent-domain cookie exposure and legal links.
- Correct WASM MIME type, compression and worker/asset loading.
- COOP/COEP and cross-origin resource policy for any threaded-WASM package;
  prove the topology on actual mobile WebViews.
- Guest auth behavior and a trusted save-service origin; secrets never enter
  title artifacts, query strings or public configuration.
- Status-cache lifetime, retry behavior, unavailable titles and no false
  “playable” telemetry from a simple page-load event.

No hosting config containing guessed account IDs, fake production resources,
or unverified security headers is checked in as a deployment-ready artifact.

## Review and activation

The future release flow is submission → validation → review → staged publish.
Required evidence includes exact source/assets, controller and touch tests,
mobile lifecycle/save tests, runtime isolation, and measured launch performance.
An approved dossier and a schema-valid package are inputs to release approval,
not automatic publication triggers.

Normal unpublication hides the title within the documented cache lifetime and
leaves active sessions running, per product direction. Define emergency-stop
behavior separately. Rollback must select a retained artifact and compatible
save version; do not rebuild an old release from floating dependencies.

Kishan is the initial hosting/DNS and release decision owner. Security reports
go through the repository’s private security advisory intake (see SECURITY.md).
GitHub secret scanning and push protection are enabled in addition to the
repository’s limited source-pattern check.

Before production, record the monitoring
destination, alert thresholds, response process, publication authority, cache
freshness target and rollback drill evidence. No production rollout is part of
this foundation PR.
