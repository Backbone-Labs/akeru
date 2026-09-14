# Server Survival local adaptation

Build explicitly with `node packages/server-survival/build.mjs`, then run `node packages/server-survival/preview.mjs`. Import `serverSurvivalOptions` from `catalog.mjs` to include it in a combined local catalog.

The build verifies selected upstream source against the existing pinned Git inventory. Original game, campaign, simulation, renderer and UI logic remain upstream code, acquired only into ignored `dist/external`. It flattens module paths, externalizes HTML handlers/styles for the strict title CSP, compiles Tailwind locally, and uses root-lockfile-pinned Three.js 0.128.0. Original notices are retained in generated output.

All five unknown-provenance audio assets and promotional art are excluded. Audio clips are silent in this local port. No external CDN requests, credentials, or original localStorage access remain. An in-memory key allowlist adapts upstream preferences and saves to the title-isolated host save service. Upstream's Save in Browser button saves the architecture; campaign achievements/preferences save automatically. Malformed or unsupported host saves disable writes, preserving existing progress.

Controller: move the pointer with D-pad/stick, press A to click, hold A and move to drag connections, B to go back. Original mouse, keyboard and touch handling remains available. Pause releases drag state and pauses upstream simulation; resize clamps the pointer.

Repository MIT declarations do not constitute publication approval. Metadata retains unknown rights/pending publication. This build does not publish or register a production game.
