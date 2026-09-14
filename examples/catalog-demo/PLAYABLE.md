# Local playable catalog

Build Anarch following `packages/anarch/README.md`, then run:

```sh
node packages/puzzle-preview/build.mjs
node packages/server-survival/build.mjs
node packages/isocity/build.mjs
node packages/whatajong/build.mjs
node packages/open-golf/build.mjs
node packages/freedoom/build.mjs
node packages/tatham/build.mjs
node examples/catalog-demo/playable.mjs
```

Follow each package README for the pinned Emscripten toolchain and native source-build prerequisites.
The printed loopback URL lists 26 local previews: Anarch, 2048, Hextris, Server Survival, IsoCity,
Whatajong, Open Golf, Freedoom Phase 1/2, FreeDM solo practice and 16 Simon Tatham puzzles,
on separate isolated title origins. This preview does not publish titles or alter the production registry.
Anarch supports WASD movement, mouse look and firing; the puzzle games support
keyboard, controller and touch. The player offers fullscreen and optional touch
buttons. Use the game's help for its specific controls.

Optional local gameplay captures live at `dist/previews/anarch.png`,
`dist/previews/2048.png` `dist/previews/hextris.png`, `dist/previews/server-survival.png`,
`dist/previews/isocity.png` and `dist/previews/whatajong.png`. These images are served
only on the shell origin and remain outside the title integrity records and
public source tree. Capture them from the running games; do not substitute
unreviewed promotional artwork. Set `AKERU_CONTROLLER_MODEL` to an external GLB
path to enable the local onboarding model.

The root URL is the landing page. **Start playing** opens first-run setup; after
setup, it opens `/games`. Returning players go directly to the library from that
button. **Discover** always opens the library; game deep links remain usable
without an account or onboarding.

**Settings** (`/settings`) offers light/dark appearance and per-game controller
remapping. Theme and mappings persist in this browser. Account connection is
unavailable in the local preview: do not enter credentials or a raw Backbone ID.
Per-game save export/reset remains on each game's details page.
The library includes discovery categories, search, sorting and local recently played history.
In Settings, select a game and open Remap controller to see live button/stick input
and assign controls by pressing a physical button. Pair a Backbone Pro through macOS
Bluetooth settings first, then press a button with Chrome focused. Automated input
tests do not replace physical Bluetooth and reconnect testing.


All previews use pinned upstream game code, with title-specific adapters.
Server Survival excludes unverified audio. IsoCity retains original placement
and rendering with a replacement procedural atlas. Whatajong is an opening-board
adaptation with original rules/shuffle and replacement CSS/glyph tiles; its
upstream campaign/shop UI is outside this preview. See each package README and
game details for provenance and controls. A working preview is not publication
approval or a completed device-conformance assessment.

FreeDM is solo map practice without bots or multiplayer. Hypersomnia is not playable;
see `packages/hypersomnia/README.md` for the source-verified blockers.
Open Golf and the 16 puzzle engines include host-owned local save adapters.
Account-linked cloud saves and native mobile conformance remain required PRD work.
