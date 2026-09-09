# Package and SDK contracts (draft 0.1)

A Backbone port, an indie submission and a community-created game use the same
`akeru.json` format. Creation tools, including AI-assisted tools, should emit this
format rather than receive a separate execution or publication path. Title-specific
adapters and assets belong in title packages; the host must not special-case titles.

This initial implementation provides a JSON Schema, semantic checks, local artifact
integrity checks, a CLI and draft TypeScript SDK interfaces. It does **not** implement
a game host, browser sandbox, publication authorization, cloud saves, input transport
or gameplay conformance. Passing validation does not establish that a game supports
touch/controller, runs safely, has cleared rights, or is approved to publish.

## Validate a package

Use the repository's pinned Node/npm versions and root lockfile:

```sh
npm ci
node packages/contracts/src/cli.js examples/contract-fixture
npm run check
```

From a workspace depending on `@akeru/contracts`:

```js
import { validateManifest, validatePackage } from '@akeru/contracts';
const result = await validatePackage('./my-title');
if (!result.valid) throw new Error(result.errors.join('\n'));
```

The workspace also exposes `akeru-validate <package-directory>` through npm's bin
resolution. Exit codes: 0 valid declarations/declared bytes, 1 validation/read failure,
2 incorrect CLI arguments. The CLI never downloads sources or runs package scripts.
The schema export is `@akeru/contracts/schema`; SDK interfaces accompany the main
export. The schema `$id` is an identifier, not a promise of a hosted schema endpoint.

`examples/contract-fixture` is original neutral HTML for testing the contract. Its
example.com provenance URLs and all-zero source commit are explicit placeholders,
not review evidence or an assertion that an upstream repository/commit exists. Its
controller/touch booleans demonstrate required fields, not functioning gameplay.
It must not enter a playable catalog or release pipeline as an approved title.

## Versions and contents

- `specVersion` is exactly `0.1.0`. Unknown schemas fail closed; migrations must be
  explicit. The pre-1.0 contract is draft and not a deployed compatibility promise.
- `version` is an independent semantic package version; `sdk.range` describes the
  host SDK versions accepted by its adapter. The default validator host is `0.1.0`;
  hosts may pass an explicit `sdkVersion`. Compatibility checks do not prove API use.
- `id` is a stable lowercase title slug. Registry ownership and collisions are host
  concerns; a package cannot claim a creator's identity by inventing a slug.
- `entry` must name a declared SHA-256 artifact. Every artifact has one provenance
  entry. Paths are portable relative paths with no escapes, encoded paths, URLs,
  hidden components or platform separators. Actual files are checked against hashes;
  symlink targets outside the root are rejected, including the manifest itself.
- Source URL, full lowercase 40/64-character Git commit, license and asset evidence
  preserve provenance. Floating branches/tags and abbreviated hashes are rejected.
  Other immutable source formats need an explicit versioned format extension. `documented`
  only describes the submission's assertion, never a rights approval. Unknown rights
  remain `unknown`; license text is not restricted to open-source identifiers because
  later indie packages may use different reviewed licensing arrangements.
- Hashes identify declared bytes, not authors or trusted releases. The validator
  does not inventory undeclared files. A future packager must construct artifacts
  from the allowlist rather than upload an entire working directory, resolve files
  into an immutable staging snapshot, and reject duplicate/ambiguous archive paths.
  Local checks are not safe against concurrent hostile filesystem mutation.

## Capabilities, device compatibility and approval

The manifest contains **requests**, not host grants. It cannot contain creator trust,
publication approval, credentials or native permissions; unknown properties and
capabilities are rejected. v0.1 requests are `save.local` (required) and optional
`save.account-sync`. Arbitrary networking and broad native APIs are not available.
A future capability must receive a versioned contract and explicit host policy.

`graphics.preferred = webgpu` with `fallback = null` requires WebGPU: an unsupported
host must decline launch. With `fallback = webgl2`, the package asserts it includes a
working WebGL2 path; the host must select a supported path and conformance must test
both. DOM, Canvas2D and WebGL2 packages use `fallback = null`; a DOM/Canvas2D
package does not imply a GPU requirement. Other fallback combinations are not part
of this draft; extend the contract explicitly when a concrete package requires one. Required WASM features must be present
or launch is denied; optional features may be selected only when detected. WebGPU,
SIMD, threads, memory64 and WASM GC are not universal WebView assumptions. A threaded
build also needs verified origin/header isolation; this manifest does not supply it.

Publication must separately bind immutable artifact identity to ownership, rights
review, content/privacy review, device conformance and host policy grants. Creator
tiers may change review requirements, never bypass isolation. Review decisions and
release/rollback/withdrawal state belong to a trusted registry, not package JSON.
No release policy or registry is implemented in this PR.

## Draft SDK boundaries

`TitleAdapterV1` initializes with host-owned services, pauses/resumes and disposes.
Initialization precedes loading/playable. The game emits `playable` only when input
can affect gameplay; page load is insufficient. Fatal/exit terminate a session;
`roundEnd` is optional. The future host must enforce ordering and prevent duplicate
terminal actions. Dispose must release listeners, audio, rendering and resources.
Background/overlay transitions clear held input and pause through the lifecycle API.

`InputSnapshot` provides normalized logical controls after host remapping/deadzones.
Gamepad API, touch and a possible narrow native input transport are interchangeable
providers. Touch and controller gameplay are both required. Disconnect/reconnect,
focus changes and provider changes must release stale held controls. The host needs
bounded logical controls, numeric range/sequence validation and a conformance harness;
the draft interfaces alone do not implement these checks. No browser API is monkey-
patched and no native message handler is exposed by this package.

`SaveService` is bound by the host to a single title and guest/player identity. The
game supplies only a slot, schema version and bytes, never account tokens, user IDs,
bucket names or another title's key. The future host must bound slots, byte sizes,
quotas and schemas, enforce access control, and scope revisions to each slot. A null
expected revision is create-only; conflicts must not silently overwrite data. Guest
local play never requires sign-in; player sign-in for account sync is optional and
sync may temporarily be unavailable. `accountSync = disabled` is accepted only to
describe development/candidate packages: the P0 release policy must require support
for optional account-linked cloud sync. This validator does not enforce release
readiness.
Host UI owns sign-in, guest migration, conflict resolution, export/reset and retention.
Game adapters handle save-schema migrations without access to account credentials.
No IndexedDB or backend implementation is provided here.

A future cross-origin transport must authenticate the session/channel, validate
message shape and limits, correlate requests, handle cancellation, and grant only
reviewed services. Isolated origins plus CSP/network policy and sandbox configuration
must protect storage and host UI. Types and property rejection are **not** an
isolation mechanism. Do not execute untrusted games in the shell origin.

## Next validation layers

This PR tests declaration rejection, compatibility and local artifact integrity.
Follow-up work must implement and test host permission denial, cross-title isolation,
message validation, lifecycle state transitions, physical controller/touch behavior,
actual renderer fallback, guest/cloud save authorization and publication approval.
Those are prerequisites for launch, not capabilities claimed by this validator.
