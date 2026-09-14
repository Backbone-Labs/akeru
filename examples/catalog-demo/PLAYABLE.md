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
