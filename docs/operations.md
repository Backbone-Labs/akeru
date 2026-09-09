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

## Hosting design to implement next

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

Before production, record the operating owner, security contact, monitoring
destination, alert thresholds, response process, publication authority, cache
freshness target and rollback drill evidence. No production rollout is part of
this foundation PR.
