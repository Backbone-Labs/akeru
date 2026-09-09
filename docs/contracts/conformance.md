# Reference conformance and integration checklist

`npm run check` executes the original `examples/reference-adapter/adapter.js`
against `@akeru/contracts/reference-host`. This fixture exercises initialization,
loading/playable, controller and touch-shaped input, pause/resume and idempotent
teardown. It is deliberately not a catalog title, renderer or full game.

The version 0.1 SDK also defines bounded presentation state/requests, audio
consent/interruption state and two numeric telemetry metrics. The reference
presentation provider begins embedded and denies fullscreen until its trusted
control plane changes mode; the telemetry provider validates and discards metrics.
Production providers must honor platform user-gesture/consent rules. Games cannot
supply user identifiers, analytics URLs or native commands through these services.

## Automated coverage

The reference host rejects lifecycle reordering, replayed/nonfinite input, unknown
fields, held controls on disconnect, ambiguous mappings, unknown telemetry and
presentation requests. Raw-input tests cover axial deadzones, mapping/remapping,
provider changes and focus loss, including a neutral release snapshot before state
changes.
Each host instance has independent in-memory save slots, capped at eight 64 KiB
slots by default, with schema checks, defensive byte copies and compare-and-swap
revisions. Host-only tests cover atomic schema migration, defensive export, scoped
reset, quota/status reporting and unavailable storage. Dispose clears listeners
and in-memory records. This is an ephemeral
contract fixture, not persistent storage or implemented cloud sync. The production
save provider must implement the same interface with durable identity-scoped data.

`planLaunch` checks manifest validity, actual host grants, runtime features and
renderer availability. A WebGPU-only title is refused on WebGL2; an explicitly
fallback-capable package selects WebGL2. Selection is tested, actual rendering is
not. Required threaded builds are refused until a reviewed worker/COOP/COEP policy
exists; optional features are not implicitly enabled by this reference plan.

The plan produces a restrictive per-title CSP with no external connections,
subframes, forms, objects or workers. Unit tests inspect the generated policy; the separate browser fixture below
checks selected enforcement paths in an actual browser. `allow-scripts allow-same-origin` is safe only with a genuinely
separate title origin, never the shell's origin. The plan rejects equal origins,
but registry allocation and actual response/header enforcement belong to hosting.
A plan does not grant publication approval or prove an immutable package is safe.
`connect-src 'self'` permits reviewed same-origin data and WASM artifacts. The
title host must allow only immutable declared paths with correct MIME types and
deny query variants, writes and external redirects; CSP is not an artifact allowlist.

## Hosting and transport acceptance checklist

Before a runtime is approved for production, retain evidence for each item:

- Allocate a unique, host-controlled HTTPS origin per title. Never serve two titles
  or the shell under the same origin. Avoid shared parent-domain authentication
  cookies; use an isolated title domain and host-only shell cookies. Reserve origin
  ownership in the registry rather than deriving it from untrusted manifest URLs.
- Serve only reviewed, hashed artifacts with correct MIME types and the generated
  CSP/Permissions-Policy headers on every entry/redirect/error route. Never reflect
  package-controlled headers, redirect to arbitrary origins, or expose write APIs
  on the title origin. Per-title same-origin resource loads remain possible.
- Load the title in the specified iframe sandbox. Host navigation interception must
  deny external/self navigation outside the immutable artifact route; CSP alone
  does not block all document navigation or data exfiltration paths. Deny popups,
  top-level navigation and undeclared downloads. Do not expose shell DOM/native APIs.
- Bind a transport session to the expected Window, exact origin, random session
  nonce and negotiated protocol version. Validate request shapes/size/rates before
  dispatch, correlate responses, cancel pending requests on teardown and reject
  replay/cross-window messages. The reference host uses direct trusted calls and
  does not implement this cross-origin message transport.
- Bind storage to trusted title and guest/account identity outside game messages.
  Test cross-title reads/writes, sign-out, guest migration, stale revisions, quota,
  offline recovery and optional cloud sync. Never share account credentials with
  the title. Browser storage partitioning alone is not application authorization.
- In actual Chromium, Safari/WKWebView and Android WebView tests, attempt forbidden
  fetch, WebSocket, beacon, external script/image/frame loads, popups, navigation,
  downloads and cross-title storage access. Assert denial and no received outbound
  request at a controlled collector; retain browser/version and header evidence.
- Exercise controller/touch gameplay, disconnect/reconnect and provider/focus changes.
  Clear held input on pause and provider switches; verify no stuck controls or audio.
  Verify fullscreen denial/recovery, loading failure, fatal/exit and repeated dispose.
- Prove real renderer fallback and required WASM features on supported devices.
  Verify cloud-save authorization and publication review independently of manifest
  validation. A passing reference suite cannot substitute for these checks.

The same checklist applies to Backbone, indie and community packages. Creator tier
may change review depth; it cannot bypass host isolation or grant publication rights.


## Running the browser fixture

Run `node packages/contracts/src/browser-conformance.js` and open its printed
loopback URL in a browser. The fixture creates four local origins: a shell, two
titles and a collector. Stop with Ctrl-C; no hosting account or deployment is used.
Each run allocates fresh ports. A JSON result must report `passed: true` and zero
collector requests. Timeout is a failure. The loopback fixture substitutes only
the HTTPS ancestor origin in the generated policy; production must use HTTPS.

The original adapter passes the runtime capability/control-help check and exercises
lifecycle and teardown, synthetic normalized controller/touch input,
save write/read/remove, fullscreen denial, safe-area/orientation state, audio
consent and bounded telemetry. It also fetches and instantiates an original empty
eight-byte WASM module from its own origin. Attempts to fetch or load
scripts/images/frames from the collector
must fail under CSP. Both titles must be denied shell DOM access and retain
independent localStorage values. Results require the expected source Window,
origin and nonce; a forged shell result must be rejected. This is a test-result
channel, not the production SDK message transport.

The fixture title host serves an explicit GET-only artifact allowlist. It rejects
query variants, non-GET requests and undeclared paths without redirecting.

Verified locally in the Codex Chromium 152 browser on 2026-09-09, including the
same-origin WASM load and zero external collector requests. This is not physical
controller/touch, WKWebView, Android WebView, WebGPU rendering or production
persistence evidence. Production navigation interception and the other denial
paths in the checklist still require the actual host integration. The optional
headless Chrome attempt failed to start reliably on the development machine;
no headless/CI browser pass is claimed. Unit conformance remains part of CI.
