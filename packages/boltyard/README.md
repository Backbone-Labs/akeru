# BOLTYARD

An original class-based team shooter (nine robot classes, six-a-side, KOTH and payload modes)
with an authoritative WebSocket game server. The game source stays in its authorized private
checkout; this package tracks only the Akeru build recipe and the title adapter.

## Build

With the root's pinned Node/npm and `npm ci --ignore-scripts`:

```sh
BOLTYARD_REVISION=<full commit> BOLTYARD_SERVER=wss://<game-server>/ws \
  node packages/boltyard/build.mjs /path/to/boltyard-checkout
```

The recipe refuses a checkout at any other revision or with tracked changes, reads committed
files through Git, flattens `client/` and `shared/` modules for the isolated title origin,
bundles the root's pinned Three.js (only modules actually imported), and records every source
and artifact hash in ignored `dist/boltyard/build-record.json`. Without `BOLTYARD_SERVER` the
build is practice-only (bots in the page, no network).

## Title adapter (`src/title.js`)

- Uses the shared creator bridge for the authenticated host channel, saves and pill actions.
- Host controller input is presented to the game as one synthetic standard-mapping gamepad
  (`navigator.getGamepads` is routed to the adapter at build time), so the game's own
  controller code, menus and aim curves work unchanged in the Backbone app.
- Settings use the host `progress` slot through the synchronous storage facade
  (`boltyard.settings.v1`, plus the pill's sound toggle).
- Host pause and backgrounding call the game's `setHostPaused`: practice matches freeze, online
  rooms keep running on the server while the local player sends neutral input.
- The game draws its own shooter touch controls, so the host touch overlay stays hidden.
- There is no mid-round restart or snapshot save; the pill reports that honestly.

## Release (public evaluation site)

`scripts/package-boltyard-release.mjs` stages, but never deploys:

1. `title --adapter-revision <akeru commit>`: the immutable title deployment under
   `releases/<digest>/` with a CSP whose `connect-src` allows only the game server origin and
   whose `frame-ancestors` allows only the public shell.
2. `shell --origin <title deployment origin> --baseline <dir> --cover <png>`: copies a shell
   directory after verifying every file is byte-identical to the live site, then adds exactly
   the BOLTYARD catalog entry, its cover and its `frame-src` origin, and updates the catalog
   release markers. It refuses to replace an existing BOLTYARD entry.

The game server's origin allow-list must contain the exact title deployment origin.

## Rights

The game was written for Backbone as original work (names, characters, maps, art, audio and
code). No license file is declared, so the manifest records source and asset rights as
`unknown`; this package does not assert a completed rights or trademark review.
