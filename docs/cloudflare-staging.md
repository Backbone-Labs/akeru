# Staging deployment runbook

The proposed staging target is a dedicated `akeru-staging` Cloudflare Worker with
static assets. It serves the empty source-linked shell, not games or account
services. No account IDs, secrets, DNS routes or production custom domains are
included. The operator must select Backbone's account and confirm the Worker name
is available before deploying. A deployed URL has not yet been recorded.

## Build and inspect

Use the repository's pinned Node/npm, a clean reviewed commit, and:

```sh
npm ci --ignore-scripts
npm run check
npm run package:cloudflare
npm exec --yes --package=wrangler@4.130.0 -- wrangler deploy --dry-run --config dist/cloudflare/wrangler.json
```

Packaging generates `dist/cloudflare/worker.mjs` and `wrangler.json`, alongside
`dist/staging`. The Worker embeds the expected asset hashes and serves only the
allowlisted assets through the ASSETS binding. Requests never forward browser
cookies or authorization to that binding. Missing, redirected or changed assets
return 503. Security headers apply to successful and error responses. The worker
has no external fetches, write APIs or privileged service bindings.

`run_worker_first: true` is required: serving assets before the Worker would
bypass its digest and header checks. HTML auto-redirect/SPA fallback is disabled.
These settings follow the [Cloudflare asset-binding documentation](https://developers.cloudflare.com/workers/static-assets/binding/).
This adapter is for the empty shell only; do not use its script-denying policy
for game execution. Per-title origins/policy remain a separate deployment unit.

## Deploy and verify

Authenticate through the normal Cloudflare login outside source control. Never
paste credentials into a title manifest or commit. Select the account explicitly
when more than one is accessible. Then the authorized operator can run:

```sh
npm exec --yes --package=wrangler@4.130.0 -- wrangler deploy --config dist/cloudflare/wrangler.json
node scripts/verify-hosted-staging.mjs https://<actual-worker-hostname>
```

Replace the placeholder with the exact URL returned by deployment. The verifier
rejects redirects, stale revisions, changed bytes or missing shell/HSTS headers.
Retain the verification output with the deployed Worker version and reviewed Git
commit. A passing mock-binding test or dry-run is not live deployment evidence.
Do not expose production DNS until actual staging and title-origin evidence passes.

## Operations and ownership

Kishan owns initial deployment/DNS decisions, release approval and rollback.
Security intake is the repository's private advisory flow in SECURITY.md.
For staging, inspect the Worker request/error metrics and `/healthz`; investigate
any verification failure immediately. For launch, configure an external one-minute
health check, alert after three consecutive failures, and a sustained 5xx-rate
alert above 1% over five minutes (minimum 100 requests). The alert destination
must be named by the operator and tested; it is not configured by this PR.

Retain every deployed source archive, release manifest and Worker version. For
rollback, select the recorded prior Worker version in Cloudflare, verify its Git
revision with the corresponding retained manifest, and rerun the hosted verifier.
Do not rebuild from a moving branch. Normal title pause/rollback uses the separate
operator availability record; this empty-shell deployment does not implement a
catalog launch consumer or activate any games. Those remain VAN-7461 acceptance
work together with title hosting and the cache/rollback drill.


## Per-title launch gateway

`platform/hosting/title-gateway.mjs` provides the independent game-origin request
handler. Configure one title identity and host-owned HTTPS origin, a different
shell origin, retained release file/digest inventories, and the title headers
from the reviewed `planLaunch` policy. Its CSP must bind that shell as ancestor.
The staging shell configuration deliberately does not deploy this handler.

A deployment adapter must bind static ASSETS and a private REGISTRY service.
REGISTRY receives GET `/titles/<configured-id>` and returns an uncached, current
`{ id, paused, current }` record from the trusted availability store; current is a
retained release digest. This service is not a public endpoint on the game origin.
No incoming cookie/authorization is forwarded. REGISTRY must implement consistent
reads without stale fallback, authenticate its publishers, and not accept title
messages as publication decisions. That service and live bindings still require
implementation/configuration; the tests supply an in-memory provider.

Every new HTML launch checks registry state, even when the caller bypasses `/`
and requests a retained entry URL directly. Pause returns 410; stale releases
return 409; missing, malformed or failed registry responses return 503. Responses
are `no-store`. Root requests redirect only to the retained current entry on the
same origin. Static assets from retained versions remain available for existing
sessions during normal pause/rollback. Do not prune versions active sessions may
still need. This is launch control, not DRM for publicly downloadable source.

Unknown paths, query strings, write methods and cross-origin requests are rejected.
Every served artifact is hash checked. MIME types are bounded to HTML, script,
CSS, JSON, WASM, inert binary/text, raster images, selected audio and WOFF fonts.
Active SVG/XML documents are excluded until their launch/asset policy is defined.
Additional HTML files are also gated;
only the configured primary HTML entry is selected by the root launch redirect.
Tests drive the existing operator pause/rollback function through this consumer:
new launches change or stop, direct stale entry URLs fail, and old session assets
remain readable. Live title-origin/DNS/service binding tests remain required.
