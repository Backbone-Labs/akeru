# Catalog and isolated runtime shell

The catalog uses the ordinary `akeru.json` package contract for Backbone,
independent and community titles. A valid manifest is never publication
permission. `platform/catalog/registry.mjs` compiles curated display metadata
and validated manifests only after an independently supplied operator verifier
returns `true` for the exact title/version, manifest digest, release digest and
allocated title origin. The verifier must authenticate the publication decision;
no manifest field, creator name or candidate dossier can supply it. The default
verifier denies every candidate.

Production `catalog.json` is empty. No approval or launch title is invented.
The production shell additionally refuses runtime launch until live publication
and save services are connected; adding a JSON entry alone cannot activate a
game. The current deploy packager also requires an empty production registry.
This is an explicit integration gate, not a claim that required guest saves or
P0 account-linked sync have been delivered by the catalog.

## Registry and routes

The registry shape is `{schemaVersion:'0.1.0',mode:'production',entries:[]}`.
Each operator-produced entry contains:

- `manifest`: the validated immutable title manifest.
- `release`: the SHA-256 release digest and dedicated canonical HTTPS origin.
- `metadata`: summary, description, category, creator, content label, controller
  and touch help, privacy details and notice links. This is reviewed catalog
  copy, separate from executable title code.
- `availability`: `available` or `paused`. Unpublished entries are omitted.

`/` is the catalog. `/g/<id>` (optionally ending with `/`) is the stable detail
route; malformed IDs and unknown titles render a safe unavailable view. Search,
categories and controller filtering operate on the current registry only.
Details expose source revision/license, credits/notices, controls, privacy and
accurate service availability before the play action. No account, membership or
purchase gates guest access.

The shell reads only same-origin `/catalog.json`, with no credentials, redirects
or cache; the response is limited to 1 MiB. No route or query parameter can name
a manifest, runtime URL, title origin or switch production into demo mode.
Metadata is rendered as text; notice/source links require credential-free HTTPS.
Runtime URLs are derived solely as
`<origin>/releases/<release digest>/<manifest.entry>`.

The catalog rechecks availability when the user starts or retries a session.
Normal unpublication does not interrupt an already running session. The title
origin gateway must independently enforce current release/availability for new
HTML loads; registry display state alone is not an activation boundary. See
[catalog hosting](catalog-hosting.md) for the separate deploy/preview package.

## Runtime and input boundary

Each frame receives `sandbox="allow-scripts allow-same-origin"` on an origin
separate from the shell and other titles. The trusted title gateway must supply
CSP and immutable-artifact restrictions; sandboxing by itself does not prohibit
network requests. The local original fixture supplies matching restrictions.

`channel.js` authenticates every message using the expected frame window,
exact origin, an unpredictable per-session nonce and monotonically increasing
sequence. Only bounded loading/playable/error/exit shapes are accepted, at most
60 messages per second. Unknown requests (including navigation, account and
cross-title save requests), extra fields, replayed sequences and nonfinite
values are rejected. A 15-second playable deadline produces a retryable error.
The shell sends one connection message after frame load; disposal stops the
channel. Child error strings and arbitrary events are never forwarded to
telemetry. The shell telemetry sink defaults to no-op and accepts only a small
bounded lifecycle allowlist; no upstream analytics SDK is loaded.

`mountCatalog({inputProviderFactory})` accepts the host-owned
`@akeru/input` browser provider. Browse/detail use a nav-only `catalog` instance.
Runtime uses the actual title ID, mounts the touch/settings UI, and forwards
normalized snapshots through the authenticated channel. The menu button is
intercepted by the shell. Pausing stops gameplay input (releasing held controls),
then starts a separate nav-only provider so controller users can resume or exit.
Resume discards that nav provider and restarts gameplay with its neutral-input
gate. Route changes, retry and disposal revoke the old session and listeners.
Backgrounding pauses a running fixture; the user explicitly resumes it.

The preview connection reports local saves unavailable and sync disabled. It
exposes no credentials, user-selected identity, account-linking success or save
success. The local fixture's `playable` event means its input study is ready,
not that it meets all publication or guest-save requirements.

## Original local fixture and validation

`examples/catalog-demo/` contains only original HTML/CSS/JS for **Orbit study**.
Its local server constructs an ordinary validated manifest with actual artifact
hashes, uses separate loopback shell/title origins and marks its registry as
`demo`. It records source rights as unknown rather than fabricating a release
approval. The prominent preview banner stays visible throughout browse, detail
and runtime. These files and demo registry are excluded from the deploy bundle.

```sh
node examples/catalog-demo/server.mjs
```

The Node tests cover independent publication, exact release identity, origin
isolation, creator parity, production/demo separation, route/filter behavior,
telemetry allowlisting and channel replay/forgery/rate/lifecycle rejection.
Browser checks should additionally exercise loading, playable, pause/resume,
touch/controller handoff, exit/retry, paused/unpublished state and narrow-screen
layout. Local desktop-browser results do not establish iOS/Android WebView,
physical controller, native deep-link, hosted domain, account migration or
performance acceptance. Those integration gates remain explicit.
