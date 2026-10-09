# Dedicated multiplayer worker

The worker registers Old San Juan Kart and Operation Blackline on one endpoint. Title-specific simulations, room state, version checks and input validators remain in their title packages. Both games use the trusted host broker; title iframes never receive worker credentials.

## Build and verify

From the repository root:

```sh
docker build --platform linux/amd64 -f deploy/multiplayer/Dockerfile -t akeru-multiplayer:local .
docker run --rm -p 8080:8080 -e SHELL_ORIGINS=https://backbone-akeru.vercel.app akeru-multiplayer:local
```

`GET /health` should return `200 ok`. Matchmaking and WebSocket upgrades reject unlisted shell origins. No-origin clients are denied in the deployed CLI entry point; the `allowHeadless` option exists only for explicit local tests.

The multi-stage image installs exact dependencies from the root lockfile and verifies pinned upstream source hashes. `stage-runtime.mjs` copies only the installed, integrity-locked runtime dependency closure and server artifacts, retaining upstream notices. With no argument it stages into the fixed `dist/multiplayer-runtime` directory; `/runtime` is the only accepted argument for the container build. It writes `runtime-lock-evidence.json`; it never resolves a second dependency tree. The runtime runs as the unprivileged Node user and contains no host credentials, browser assets or source checkout.

Run `npm run check` and `node --test tests/multiplayer-combined.test.mjs` before publishing the image. The smoke test exercises both room types on the same endpoint, origin rejection, incompatible/cross-title builds, guest joining and independent starts.

## Initial Cloud Run evaluation service

Use a **new dedicated service and least-privilege runtime service account**. The runtime needs no Google API access. Explicitly choose the project, region, Artifact Registry image digest and service account after reading the authenticated account and enabled services; this document does not select or change a mobile/backend production service.

```sh
gcloud run deploy akeru-multiplayer \
  --project "$AKERU_PROJECT" --region "$AKERU_REGION" \
  --image "$AKERU_IMAGE_DIGEST" \
  --service-account "$AKERU_RUNTIME_SERVICE_ACCOUNT" \
  --allow-unauthenticated --ingress all --port 8080 \
  --cpu 1 --memory 1Gi --no-cpu-throttling \
  --min 1 --max 1 --max-instances 1 \
  --concurrency 80 --timeout 3600 \
  --set-env-vars SHELL_ORIGINS=https://backbone-akeru.vercel.app \
  --startup-probe httpGet.path=/health,httpGet.port=8080
```

The endpoint is public because guests do not have Google identities. The shell-origin checks, private room IDs, version gates, payload limits and per-client rates still apply. Origin checks are browser boundaries, not protection from custom network clients. The IP limiter uses the direct peer address, so behind Cloud Run it is a coarse backstop, not a distinct end-user quota.

**Keep one active instance and one serving revision for this evaluation.** Cloud Run session affinity is best effort and does not route a room to its owner. Do not increase max instances, traffic-split revisions, enable end-to-end HTTP/2 or advertise horizontal scaling using this configuration. Instance replacement/deployment ends in-memory rooms; the platform may briefly overlap instances during replacement even with the configured limit. Plan maintenance, tell active players to create a fresh room, and verify new room creation/joining after rollout. Rooms expire after 30 minutes, below the configured 60-minute connection timeout.

For horizontal capacity, use worker-specific browser-routable addresses with the shared Redis driver/presence already supported by the server, plus routing/admission/draining and load testing. A generic Cloud Run autoscaling URL is not a worker-specific address. Redis coordination alone does not preserve live simulation state after process loss.

At the published us-central1 instance-based rates checked September 28, 2026, one continuously allocated vCPU plus 1 GiB costs approximately **$51.84 per 30 days before free-tier credits**, storage, image builds, network egress, logs and taxes. This is a resource assumption, not a measured game capacity or a hard bill cap. Max instances bounds ordinary scaling, not every replacement overlap or non-compute charge. Configure a project budget/alert separately.

References: [Cloud Run WebSockets and routing](https://docs.cloud.google.com/run/docs/triggering/websockets), [billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [pricing](https://cloud.google.com/run/pricing).

## Connect the existing website

Keep all existing catalog entries and immutable title origins. Update only Kart and Blackline to the new verified title artifacts and add Blackline if absent. The trusted shell bootstrap imports `createCatalogMultiplayerFactory` and `catalogInputMapping`, registering both title IDs against the returned HTTPS worker origin. Add that exact HTTPS origin and corresponding WSS origin to shell CSP `connect-src`; title CSP remains isolated and only permits its own static asset fetches when requested. Never insert a localhost endpoint into the public bundle.

Verify public `/health`, negative-origin requests, two independent guest browsers creating/joining/readying/playing each title, reconnect, and unchanged launch of an existing non-multiplayer title before updating the primary website alias. Retain the previous shell deployment for rollback; rolling it back does not recreate old in-memory matches.
