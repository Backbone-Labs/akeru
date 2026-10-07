# DOCKFUSE

An original 5v5 round-based plant/defuse tactical shooter (buy phase, economy, recoil control,
bots, touch and controller) with an authoritative WebSocket game server. The game source stays in
its authorized private checkout (`kishanPBB/dockfuse`); this package tracks only the Akeru build
recipe and the title adapter.

## Build

With the root's pinned Node/npm and `npm ci --ignore-scripts`:

```sh
DOCKFUSE_REVISION=<full commit> DOCKFUSE_SERVER=wss://<game-server>/ws \
  node packages/dockfuse/build.mjs /path/to/dockfuse-checkout
```

The recipe refuses a checkout at any other revision or with tracked changes, records the hash of
every committed build input, runs the checkout's own pinned toolchain (`npm ci`, `vite build`;
Three.js is bundled by the game from its lockfile), rewrites the single output module so browser
storage and gamepads go through the host facade, splits the page's inline stylesheet into a file,
and records every artifact hash in ignored `dist/dockfuse/build-record.json`. Without
`DOCKFUSE_SERVER` the build is practice-only (bots in the page, no network).

## Title adapter (`src/title.js`)

- Uses the shared creator bridge for the authenticated host channel, saves and pill actions.
- Host controller input is presented to the game as one synthetic standard-mapping gamepad
  (`navigator.getGamepads` is routed to the adapter at build time); the game's own controller
  code (sticks, triggers, D-pad shortcuts, menu navigation) works unchanged in the Backbone app.
- Settings and callsign use the host `progress` slot through the synchronous storage facade
  (`dockfuse.settings`, `dockfuse.name`, plus the pill's sound toggle).
- Host pause and backgrounding call the game's `setHostPaused`: practice matches freeze, online
  rooms keep running on the server while the local player sends no input.
- The game draws its own shooter touch controls, so the host touch overlay stays hidden.
- There is no mid-round restart or snapshot save; the pill reports that honestly.

## Release (public evaluation site)

`scripts/package-dockfuse-release.mjs` stages, but never deploys:

1. `title --adapter-revision <akeru commit>`: the immutable title deployment under
   `releases/<digest>/` with a CSP whose `connect-src` allows only the game server origin and
   whose `frame-ancestors` allows only the public shell.
2. `shell --origin <title deployment origin> --baseline <dir> --cover <png>`: copies a shell
   directory after verifying every file is byte-identical to the live site, then adds exactly
   the DOCKFUSE catalog entry, its cover and its `frame-src` origin, and updates the catalog
   release markers. It refuses to replace an existing DOCKFUSE entry.

The game server's `ALLOWED_ORIGINS` must contain the exact title deployment origin.

## Rights

The game was written for Backbone as original work (names, factions, map, art, audio and code;
see its `docs/LEGAL.md`). No license file is declared, so the manifest records source and asset
rights as `unknown`; this package does not assert a completed rights or trademark review.
