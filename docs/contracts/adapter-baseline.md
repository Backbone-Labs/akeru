# Adapter and isolation baseline (draft 0.1)

This baseline defines the reusable title/host boundary for Backbone, indie and
community packages. It is a contract and reference fixture, not a production
browser host, native input provider, cloud-save service or publication decision.

## Adapter shape and lifecycle

A JavaScript adapter must pass `assertTitleAdapterV1` before initialization. It
must provide `initialize`, `pause`, `resume` and idempotent `dispose` functions,
plus non-empty controller and touch control-help entries. Adapters may hold private
implementation state. Missing required functions, malformed help or help for only
one required input path fails closed.

The title reports loading progress through `loading`, becomes interactive only
after `playable`, and reports bounded errors through `fatal`. The shell owns the
loading, controls-help and error UI and renders game-provided strings as text.
`fatal` and `exit` end the session. Pause must stop gameplay and audio; dispose
must remove every input/presentation/audio listener and release rendering.

## Input

Providers deliver bounded physical button values in [0,1] and axes in [-1,1].
The host maps physical names to logical names before the game sees them. Unmapped
controls are dropped. Each logical target may have only one physical source in a
mapping. The reference deadzone is axial: values whose absolute value is at or
below the configured threshold become zero; values outside it are rescaled to the
remaining [-1,1] range.

The host owns the monotonically increasing output sequence. A provider change,
focus loss or remap first delivers an empty `buttons` and `axes` snapshot. Empty
controls are the neutral/release state and prevent a previously held control from
sticking. Input while unfocused is suppressed. Regaining focus never replays held
state; a fresh provider sample is required. A disconnected provider must send only
zero values and cannot retain active state. A narrow native provider follows the
same envelope and receives no broader native authority.

## Presentation and audio

`presentation.getState` supplies a complete, bounded safe-area rectangle in CSS
pixels relative to the current viewport, current
portrait/landscape orientation and embedded/fullscreen mode. Changes arrive through
`onChange`. A title may request a mode; the returned mode is authoritative and a
request never grants navigation or native UI. Fullscreen remains subject to a user
gesture and platform policy.

Audio starts blocked until the host records consent. `requestPlayback` reports the
current decision rather than granting itself. Backgrounding and route changes move
audio to an interrupted state; the title waits for a later ready state before
resuming. These state changes are host decisions and do not expose device APIs.

## Saves

The game-facing save service remains bound to trusted title and guest/account
identity. It exposes read/write/remove, compare-and-swap revisions and status. The
status includes local and optional-sync availability plus used slots, bytes, and
host limits. Games never choose an identity, receive credentials or silently
overwrite a revision conflict.

Migration, export and reset are host control-plane operations and are deliberately
absent from `HostServicesV1`. The reference host can seed an older schema and run
an adapter-provided byte migration to the declared target version. All records are
committed only after every migration result passes schema and quota validation.
Exports are defensive byte copies without account identifiers. Reset clears only
the already-bound host instance. Production UX, retention, guest-to-account
migration, conflict resolution, durable storage and cloud authorization remain
separate host work.

## Compatibility and isolation

`planLaunch` validates `sdk.range` against the selected host SDK and refuses an
incompatible version before execution. It separately checks requested capability
grants, renderer support and required runtime features. A compatible declaration
does not prove that adapter code implements the API, so runtime adapter validation
is also required.

The reference browser fixture runs two title origins, a shell origin and a
collector. It checks adapter shape, lifecycle, input, save, presentation/audio,
listener teardown, origin/nonce/source validation, title storage separation and
selected CSP denials. Production still requires an authenticated bounded transport,
immutable hosting, navigation interception and real browser/device testing.

## Acceptance ownership

Automated contract and fixture checks provide engineering evidence. Web, Mobile,
Security, Privacy and QA owners must review the production integration and retain
their own evidence before launch. Their signoff is not stored in a title manifest,
inferred from a passing test or fabricated by this repository.
