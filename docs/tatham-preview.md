# Simon Tatham collection: sixteen local previews

The title package builds sixteen original engines from [Simon Tatham’s Portable
Puzzle Collection](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/): Net,
Fifteen, Flood, Same Game, Pegs, Solo, Unequal, Towers, Mines, Light Up, Bridges,
Loopy, Black Box, Guess, Inertia and Untangle. Puzzle generation, rules, solvers,
rendering and native save format come from the upstream C source. These are
individual games from that collection, not Akeru reimplementations.

## Reproduce

Use the repository’s pinned Node 24.19.0 and npm 11.17.0. Install Emscripten
4.0.15 separately, then run:

```sh
AKERU_EMCC=/absolute/path/to/emscripten/emcc node packages/tatham/build.mjs
npx playwright test tests/browser/tatham-preview.spec.mjs --workers=1
npm run check
```

`AKERU_EMCC` defaults to `/tmp/akeru-emsdk/upstream/emscripten/emcc` for the local
evaluation workspace. This explicit build downloads the public source; ordinary
root builds and tests do not acquire third-party content. The immutable revision
is `ea09098d71db949351437eba1920033d3a08f491`. Every source/header used in the build
is checked against the inventory’s Git blob identity before compilation. The
build fails if the known upstream launch/storage hooks change.

The catalog factory is `tathamOptions(id)` in `packages/tatham/catalog.mjs`.
`packages/tatham/titles.mjs` exports the sixteen entries and IDs. Builds appear in
`dist/tatham-ENGINE/`, while browser QA captures `dist/previews/tatham-ENGINE.png`.
Each build record lists source/artifact SHA-256 digests and compiler version.
`wasm: true` enables the existing local runtime’s same-origin WASM loading policy;
the title manifest separately declares required feature `wasm`.

## Input, lifecycle and saves

The host supplies normalized controller input through its authenticated channel.
Arrows/left stick move the upstream cursor, A selects, B performs the alternate
action. In number puzzles, right-stick left/right chooses a digit and A enters it;
B clears it. Right-stick up/down performs undo/redo. Pegs uses A to select a peg,
then a direction to jump. Guess uses up/down to choose a colour, A to place it,
and right to advance to the next peg or submit position. Untangle uses B to cycle
points, A to pick one up, arrows to move it and A to drop it. Bridges uses A to
select an island, then a direction to draw a bridge. Inertia supports diagonal
stick directions and four diagonal touch buttons.

Upstream Loopy has no keyboard cursor, so its adapter shows a pointer and calls
the original mouse API for controller/keyboard selection. It does not duplicate
edge selection or puzzle rules. All games retain direct mouse input. Touch uses
pointer down/move/up with captured drag positions; the alternate toggle produces
right-click actions. The original short instructions are included in the local
help dialog, with upstream licence and credits.

Guest progress uses only Akeru’s title-scoped save service. The upstream browser
preferences are disabled, and the host fragment is never interpreted as a puzzle
seed. Save envelopes reject other title identities, incompatible schema versions,
truncated headers and oversized payloads. Upstream validates the native serialized
puzzle payload. Bad saved data is preserved rather than overwritten. Direct input
and engine timer advancement are blocked during host pause. Account sync is disabled.

## Rights and publication status

The primary upstream [repository](https://git.tartarus.org/simon/puzzles.git) and
its `LICENCE` declare MIT terms for the collection and list its contributors.
The build preserves the exact upstream licence and Emscripten licence in every
title’s output. Included visuals are drawn by the original C canvas frontend;
there are no downloaded font, music, image or commercial-game assets.

The source inventory still records file rights as **unreviewed**, and generated
artifact rights and publication approval remain **unknown/pending**. The source
licence evidence is not a completed asset audit or a grant from Akeru to publish.
No production registry, deployment or activation is changed. Third-party source,
compiled binaries, screenshots and copied notices remain under ignored `dist/`;
only acquisition/adaptation code, metadata, tests and provenance are committed.

## Verification boundaries

The browser suite makes an actual gameplay move in every engine and checks its
native move-history count, observes standard-gamepad input transported through
the host, sends real touchscreen input, tests pause and a wrong-nonce resume,
and reloads persisted guest progress. It saves a board screenshot for every title.
The suite skips explicitly when the optional local build is absent. Hardware
controllers, Safari and physical mobile devices still require device testing.
