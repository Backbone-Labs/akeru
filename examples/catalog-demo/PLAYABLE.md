# Local playable catalog

Build Anarch following `packages/anarch/README.md`, then run:

```sh
node packages/puzzle-preview/build.mjs
node examples/catalog-demo/playable.mjs
```

The printed loopback URL lists Anarch, 2048 and Hextris on separate isolated title
origins. This preview does not publish titles or alter the production registry.
Anarch supports WASD movement, mouse look and firing; the puzzle games support
keyboard, controller and touch. The player offers fullscreen and optional touch
buttons. Use the game's help for its specific controls.

Optional local gameplay captures live at `dist/previews/anarch.png`,
`dist/previews/2048.png` and `dist/previews/hextris.png`. These images are served
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
