# Catalog staging

The catalog is a separate, versioned shell deployment. This build path includes
only the empty production registry: no game is activated by packaging or deploy.
The original local demo is excluded. Adding published entries requires the
reviewed publication service and title-origin policy, not editing this guard out.

From a clean commit containing catalog and input modules:

```sh
npm ci --ignore-scripts
npm run check
node scripts/package-catalog.mjs
node scripts/serve-catalog.mjs
```

Open `http://127.0.0.1:4174`. The catalog and `/g/<id>` deep links use the same
shell; an unknown title shows unavailable in the UI. Local serving verifies the
entire release and source archive before listening. Package output includes
source archive, exact revision, file hashes and license. No account credentials
or private context are bundled.

The generated `dist/catalog-cloudflare/wrangler.json` targets the dedicated
`akeru-catalog-staging` Worker. Before deploying, confirm the account and Worker
name. Using an authenticated operator session:

```sh
npm exec --yes --package=wrangler@4.130.0 -- wrangler deploy --dry-run --config dist/catalog-cloudflare/wrangler.json
npm exec --yes --package=wrangler@4.130.0 -- wrangler deploy --config dist/catalog-cloudflare/wrangler.json
node scripts/verify-hosted-catalog.mjs https://<actual-worker-hostname>
```

Keep `run_worker_first` enabled. The Worker verifies every asset against the
embedded release, restricts paths and methods, and strips caller credentials
before calling ASSETS. Shell JS and registry requests are same-origin; game
frames are denied with the empty registry. Deep links never select a registry,
origin or runtime from query parameters. Headers and all asset bytes, deep-link
routing and rejection of demo paths are checked by the hosted verifier.

Record the returned Worker version, source revision, verification output and
rollback version. The operator remains responsible for actual hosting, alerts
and per-title launch-service bindings. Browser gamepad support does not establish
physical iOS/Android controller approval or native universal-link association.
