# Racing and arcade evaluation titles

Explicit local evaluation packages for HexGL, Retro Road Racer, Astray and BreakLock.
Build each using the pinned Node/npm versions:

```
node packages/hexgl/build.mjs
node packages/racer/build.mjs
node packages/astray/build.mjs
node packages/breaklock/build.mjs
node examples/catalog-demo/playable.mjs
```

Acquisition is explicit and pinned to the source inventories. Root builds/checks do
not download third-party titles. Upstream code/assets stay in ignored `dist/`;
only our build recipes, adapters and source inventories belong in the repository.
Each title keeps its own game-specific adapter and saves. The generic host binds
input/persistence to the existing authenticated catalog channel.

- HexGL: original Cityscape assets/engine, keyboard/touch/controller input,
  best completed race time. MIT root license conflicts with noncommercial
  per-file headers; public preview packaging is blocked pending reconciliation.
- Retro Road Racer: Jake Gordon's road/traffic/driving code with original
  procedural artwork. Upstream borrowed OutRun sprites and paid music are
  excluded. Persists best lap, not mid-race position.
- Astray: original maze generator, physics and renderer. Saves maze and ball
  position. Bundled legacy dependency and image rights still need release review.
- BreakLock: original pattern generation and matching model; new accessible UI
  for controller/keyboard/touch. Saves the current puzzle, guesses and win count.

A local playable build is not a publication approval. Device Bluetooth testing
must be performed with a physical controller; simulated input tests do not prove
physical pairing or iOS WebView behavior.

Golden Axe is intentionally not a playable entry: an exact edition, authorized
source/assets and redistribution/hosting rights are required before integration.
No ROM is downloaded or bundled by these recipes.
