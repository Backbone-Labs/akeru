# Old San Juan Kart evaluation package

Upstream: https://github.com/nasilvae/old-san-juan-kart (MIT). The source inventory pins the exact commit and Git objects. This package imports the existing game; it does not recreate its gameplay. Upstream source and generated game builds are not checked into Akeru.

Build explicitly with `node packages/old-san-juan-kart/build.mjs`. Uses the root-lockfile Three.js version and a self-contained flattened module graph. No upstream install scripts run. The output includes upstream and Three.js license notices. Procedural artwork/audio comes from the upstream code; formal publication approval remains separate from evaluation hosting.

The evaluation starts one Viejo circuit with the first racer. A/Enter or the Race button launches it; A accelerates, B brakes, left stick steers, D-pad down drifts and up uses an item. Keyboard and upstream touch controls remain available. Touch controls hide when the host detects a controller. The host pauses simulation and audio when its menu is open or the document is hidden.

Audio preferences use host-owned namespaced saves. Race progress and exact-moment save states are not implemented. A tap may be required to unlock audio on iOS. Source-level mobile support and automated browser checks are not physical-device certification.

## Multiplayer motion

The server simulates at 60 Hz and publishes at 20 Hz. The owning client runs the
same hash-pinned physics at 60 Hz, sends paired input ticks at 30 Hz, restores
server checkpoints and replays only unacknowledged input ticks. Checkpoints include
partial acknowledgements, the full movement state and a respawn generation;
position/rotation corrections blend into presentation instead of restarting an
arrival-driven 50 ms animation. Render interpolation also covers steering, tilt,
wheels and suspension. Race laps, ranking and results always remain authoritative.

Other karts use a 120 ms server-time playback buffer with at most 100 ms of
extrapolation for a missing update. History and replay are bounded; reconnects,
respawns and long stalls reset prediction. The multiplayer predictor uses the
same track collision limits as the server, rather than the solo client's
art-derived clearance map. The v2 build gate keeps older network clients out.

Online Escape/race-menu and host pause suspend only the local controls; the room
continues racing. Keyboard focus and held inputs reset on resume. Deterministic
physics tests and real two-browser tests cover 60–150 ms delivery jitter,
partial acknowledgements, respawns, pause/resume and reconnect. These checks do
not establish Internet latency or production capacity guarantees.
