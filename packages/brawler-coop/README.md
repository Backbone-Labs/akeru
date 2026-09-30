# Brawler Co-op web adapter

Exports an explicitly supplied creator checkout with Godot 4.7.2 and the matching official single-thread Web release template. The game implementation and exported binaries stay outside Git; normal builds and CI never fetch them. The pinned revision is checked before export. No desktop repository files are modified.

```sh
GODOT=/path/to/Godot \
GODOT_WEB_TEMPLATE=/path/to/web_nothreads_release.zip \
node packages/brawler-coop/build.mjs /path/to/creator-checkout
node packages/brawler-coop/preview.mjs
npx playwright test tests/browser/brawler.spec.mjs
```

Set `BRAWLER_RELAY_URL` to an explicitly deployed `wss://…/relay` endpoint to enable 2–4 player browser co-op. Without it, the build remains solo-only. The original ENet/UDP transport is replaced in the web staging copy; the creator checkout is untouched. See [NETWORKING.md](NETWORKING.md) for architecture, room limits and deployment instructions.

The adapter uses the authenticated Akeru channel for controller and shared touch input, pause/resume, sound status/toggle and restart. A/X map to jump/attack; RT also attacks. Engine gamepad bindings are removed to avoid double input. Keyboard arrows/X/C remain available. Quiver runtime references to editor-only constants are replaced with their original literal values in the export staging directory.

There are **no game saves or exact save states** in this title. The standard manifest declares the host's required title-scoped guest-storage interface, but the title does not use it or advertise save actions. Restart starts a new run. No cloud sync is used. Co-op builds connect only to their configured room relay.

The build includes Quiver's MIT code notice, CC-BY 4.0 asset notice, credits and modifications, plus Godot's engine and third-party notices in `LICENSES.txt`. Source and asset provenance remain distinct from publication approval. A successful export or manifest validation does not publish the game. The game requires WebAssembly and WebGL 2; no WebGPU or cross-origin isolation is required. Its own origin permits blob images used by Godot; scripts remain same-origin and network requests are limited to the game origin and its explicit relay endpoint.

Browser checks cover exported gameplay startup, simulated controller and touch input, pause neutralization, audio state, restart and rejection of a frame impersonating the host. Physical Backbone and phone performance still require device acceptance. Large initial game assets can make a cold mobile launch slower than subsequent launches.
