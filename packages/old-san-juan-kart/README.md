# Old San Juan Kart evaluation package

Upstream: https://github.com/nasilvae/old-san-juan-kart (MIT). The source inventory pins the exact commit and Git objects. This package imports the existing game; it does not recreate its gameplay. Upstream source and generated game builds are not checked into Akeru.

Build explicitly with `node packages/old-san-juan-kart/build.mjs`. Uses the root-lockfile Three.js version and a self-contained flattened module graph. No upstream install scripts run. The output includes upstream and Three.js license notices. Procedural artwork/audio comes from the upstream code; formal publication approval remains separate from evaluation hosting.

The evaluation starts one Viejo circuit with the first racer. A/Enter or the Race button launches it; A accelerates, B brakes, left stick steers, D-pad down drifts and up uses an item. Keyboard and upstream touch controls remain available. Touch controls hide when the host detects a controller. The host pauses simulation and audio when its menu is open or the document is hidden.

Audio preferences use host-owned namespaced saves. Race progress and exact-moment save states are not implemented. A tap may be required to unlock audio on iOS. Source-level mobile support and automated browser checks are not physical-device certification.
