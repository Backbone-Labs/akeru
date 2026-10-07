# Bubble Kick adapter

Build from an explicitly supplied, clean creator checkout pinned by `BUBBLEKICK_REVISION`:

```
BUBBLEKICK_REVISION=<full-commit> node packages/bubblekick/build.mjs /path/to/source
```

The isolated package uses the shared authenticated Akeru channel for native/browser controller input, pause/resume, audio, and title-scoped local saves. No custom Backbone pill is added. Settings and lifetime records persist; running matches are not snapshots. One host-selected controller and local keyboard/touch are supported. Physical-device and multi-controller acceptance are separate checks.

This preview is offline: CPU matches and local play. Online is explicitly unavailable until a production server is integrated. The build rejects online endpoints. Three.js comes from the exact pinned root dependency; its MIT notice is bundled. Procedural title assets are supplied by the creator. Rights remain recorded as unknown rather than asserting legal clearance.

Build output and private source records stay in ignored `dist/`. Release packaging excludes the private build record. The title is deployed to an isolated game origin; shell packaging verifies the live baseline before adding the entry, screenshot and frame origin. Local builds and tests never deploy.
