# IsoCity local adaptation

Build with `node packages/isocity/build.mjs`, then preview with `node packages/isocity/preview.mjs`. The combined catalog factory is `isoCityOptions` from `catalog.mjs`.

This uses Victor Ribeiro's actual pinned IsoCity placement, map rendering, tile drawing and isometric coordinate conversion functions. Selected bytes are checked against the existing Git source inventory; original code is acquired only into ignored `dist/external` and built into ignored `dist/isocity`.

The upstream bitmap atlas has unresolved asset provenance, and the source includes a borrowed base64 helper with unresolved attribution. Neither is selected into this build. Akeru provides a new, original canvas-generated 12-tile city palette and host-owned initialization/input/save UI. The core is extracted from `const click` onward, excluding initialization, URL saves and both base64 helpers. The adaptation is disclosed in game details and build record; it is not represented as the unchanged original visual release.

Guest maps use the title-scoped host save client. A malformed saved map blocks subsequent writes rather than overwriting existing progress. Controller, keyboard and touch all invoke the original placement routine. Palette changes and pointer coordinate scaling are host adapters.

The original MIT notice is retained in generated output. Unknown rights and pending publication are preserved. This is local evaluation only, with no deployment or production registration.

Whatajong remains unavailable: its pinned audit identifies unresolved fonts, tiles, sprites, backgrounds, music and sound rights. Excluding those would require a larger visual and dependency adaptation; no placeholder is offered as the upstream game.
