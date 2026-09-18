# Original desktop game browser evaluation

These adapters run the existing SuperTux 0.6.3 release and ading2210's experimental
SuperTuxKart browser port. Original levels, graphics, music and game logic are
retained. No game logic or replacement artwork is generated here.

Explicit local acquisition and builds (never part of root build/check):

```
node packages/wasm-desktop-preview/acquire.mjs supertux
node packages/wasm-desktop-preview/acquire.mjs supertuxkart
node packages/supertux/build.mjs
node packages/supertuxkart/build.mjs
node packages/wasm-desktop-preview/preview.mjs
```

Acquisition verifies pinned artifact digests. SuperTux comes from its official
v0.6.3 WebAssembly release. SuperTuxKart artifacts come from the port author's
site; its pinned source branch is an audit starting point, not proof those
binaries correspond exactly to that commit. Public deployment is blocked for
both until corresponding source, dependency and asset notices are reviewed.
Do not copy downloaded binaries into Git or claim publication approval.

Both prebuilt engines require shared WebAssembly memory. The local preview sets
COOP/COEP, grants cross-origin isolation only to titles declaring threads, and
allows same-origin workers and in-memory image/audio decoding. Existing standard
previews keep their previous policy. WebView compatibility must be verified on
real devices; these desktop checks do not establish iOS support.

Saves are bounded snapshots of the engine's own user files, carried through the
existing host save service. Engines do not mount IndexedDB. SuperTux's mount is
removed with a fail-closed patch; SuperTuxKart's sync hook requests host saving.
Symlinks, cache files and logs are excluded. Paths, duplicate files, sizes and
base64 content are validated before restoring. These are original game saves,
not arbitrary mid-frame emulator save states. Save errors preserve prior data.

SuperTuxKart is offline: WebSocket configuration is disabled, the initial config
disables internet requests, and CSP excludes external services. Its original UI
still exposes online features; do not enable/publish them without a native source
patch to remove unsupported actions. The local profile screen is the game's own
profile, not a Backbone account. Keyboard provides the original full controls;
the current controller mapping covers driving, selection/fire, back/rescue and
menu. Dedicated drift/nitro mappings need expansion before controller certification.

Public evaluation and production catalogs are separate from this local preview.
