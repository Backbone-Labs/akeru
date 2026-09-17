# Open Golf local port

This builds and runs mgerdes/Open-Golf at
`b9029f1e80c3110ae3d4fc9300854bdaeef96508`. The actual upstream physics,
renderer, courses, UI and audio are compiled to WebAssembly. There is no
replacement golf game or remote iframe.

## Build and run

Use the root pinned Node/npm toolchain and installed root dependencies. Install
Emscripten **4.0.15**, put its tools on PATH, and obtain the pinned checkout in a
private directory outside the tracked tree:

```sh
OPEN_GOLF_SOURCE=/path/to/Open-Golf node packages/open-golf/build.mjs
node packages/open-golf/preview.mjs
```

The factory is `openGolfOptions()` from `preview.mjs`. The output is ignored
`dist/open-golf/`; temporary copied source and objects are in ignored
`dist/open-golf-source/`. The factory checks the exact artifact list and hashes
before serving. Each selected source/data file is checked against its pinned Git
blob in `compliance/source-inventories/open-golf.json`. Upstream helper binaries
are never executed. A deterministic ZIP is produced locally from verified data.

## Adapter behavior

- WebGL2 and WASM are required and declared; no WebGPU assumption.
- Dependency loading and GPU finalization run on the browser thread, replacing
  the upstream pthread queue. This avoids a service worker, SharedArrayBuffer
  and cross-origin-isolation changes to the host. Level changes can briefly
  block while original assets are loaded.
- Mouse drag and native touch use the upstream circle/power mechanics.
  Controller or host touch overlay uses left/right to aim, up/down for power,
  and A to putt. Enter/Space, arrows/WASD and M provide keyboard equivalents.
  Left/right on the menu selects any of the twenty courses; A starts it.
- The host pause stops the engine frame and clears held input. Resume clamps
  elapsed time; it does not advance physics by the time spent paused.
- Only bounded numeric best scores and tutorial progress can cross the scoped
  save bridge. IDBFS is removed; the in-memory filesystem holds only this title's
  save bytes. Guest progress uses the host store. Corrupt or conflicting saves
  are preserved, and no cloud/account credentials enter the game.

## Verification and rights

`tests/browser/open-golf.spec.mjs` exercises the actual local WASM through Chrome,
including a real putt, pause, gamepad input, touch and the host save boundary.
Unit tests reject malformed progress and nonfinite input. The build requires a
5 MB stack because the original font loader exceeds Emscripten's 64 KB default.

This remains **local evaluation only**. Root MIT and vendor notices are retained
in `UPSTREAM-NOTICES.txt`; fonts, asset groups and generated imports still have
unknown rights recorded by the root audit. No source or third-party assets are
committed. The build does not activate a registry entry or grant publication.
