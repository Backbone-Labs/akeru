# Platform architecture

## One path for every creator

Backbone ports are the first clients of the same package contract that future
indie and community/AI-created games will use. Creator tooling should emit
ordinary packages. Per-title adaptations live in those packages; the catalog,
native apps and SDK must not accumulate title-ID-specific branches.

The stable boundaries are:

1. **Title package:** immutable version, entry point, artifact hashes, exact
   source and asset provenance, controls, required/optional runtime features
   and requested capabilities.
2. **SDK and host:** independently versioned lifecycle, controller/touch,
   presentation and save interfaces. Browser/native input transports are
   replaceable providers. Titles do not receive native or account credentials.
3. **Registry and review:** source-independent validation, accountable review,
   staged publication and rollback. Creator tier, package validity, granted
   permissions and release status are separate concepts.
4. **Player services:** optional identity and account-linked save synchronization
   owned by trusted services, with per-user/per-title authorization and version
   conflicts. Guest play and local saves work without signing in.

The initial foundation provides project checks and source provenance. Contracts
and compliance are parallel initial work; this document is not a claim that a
sandbox, SDK host, registry or save service already runs.

## Compatibility

Version the package specification and SDK independently. Declare supported
ranges and reject incompatible versions explicitly; do not guess that an
unknown major version is compatible. Any breaking change needs a migration
story for existing packages and saves before release.

Controller and touch are both required. Gamepad and any later native input
provider must feed the same normalized SDK interface. The native transport
decision remains open pending device evidence; no proprietary broad bridge is
part of this foundation.

Rendering belongs to each package. Allow declared WebGL/WebGL2, Canvas and
WebGPU requirements without forcing every port through a new renderer. A
WebGPU-capable package may provide a reviewed fallback; a missing required
feature without a fallback means unsupported, not a silent downgrade. Check
actual adapters/features and WebView behavior, not only a browser name or the
presence of `navigator.gpu`. WASM CPU features are declared independently.

## Security and data

Separate the trusted shell/services from title execution. A capability in a
manifest is a request; policy evaluates it and the host enforces any grant.
Use distinct title origins/storage boundaries rather than assuming URL paths
isolate games. Keep credentials out of title URLs, messages and storage.

The save contract must account for local guests, account linking, migration,
conflicts, quota, version rollback and deletion. Device timestamps alone are
not trusted conflict authority. Do not commit to a 1 MB cap or a storage vendor
until representative save formats are measured.

AI-created assets and code need the same provenance, rights and content review
as other submissions. Verified creators do not automatically get wider host
permissions. Do not execute submitted build scripts in a privileged review job.

## Later phases

Submission portals, creator verification, templates/editor/AI tooling,
moderation/reporting/appeals and community operations can attach to these
contracts later. Multiplayer, social features, payments and creator economics
are separate decisions. We are not implementing speculative services now.

An outside developer should eventually be able to package, validate and submit
a title with documented tools, without app-specific code or a mobile release.
First-party fixtures and ports must prove that workflow before opening it up.
