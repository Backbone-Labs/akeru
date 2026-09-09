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
