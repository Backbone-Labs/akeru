# Bubble Kick adapter

Build from an explicitly supplied, clean creator checkout pinned by `BUBBLEKICK_REVISION`:

```
BUBBLEKICK_REVISION=<full-commit> node packages/bubblekick/build.mjs /path/to/source
```

The isolated package uses the shared authenticated Akeru channel for native/browser controller input, pause/resume, audio, and title-scoped local saves. No custom Backbone pill is added. Settings and lifetime records persist; running matches are not snapshots. One host-selected controller and local keyboard/touch are supported. Physical-device and multi-controller acceptance are separate checks.

Without BUBBLEKICK_SERVER the build supports CPU matches and local play and disables online rooms. Supply a fixed `wss://<host>/ws` BUBBLEKICK_SERVER to enable online play. Three.js comes from the exact pinned root dependency; its MIT notice is bundled. Procedural title assets are supplied by the creator. Rights remain recorded as unknown rather than asserting legal clearance.

Build output and private source records stay in ignored `dist/`. Release packaging excludes the private build record. The title is deployed to an isolated game origin; shell packaging verifies the live baseline before adding the entry, screenshot and frame origin. Local builds and tests never deploy.

## GCP multiplayer

Prepare the server from the same clean, pinned creator checkout:

```
BUBBLEKICK_REVISION=<full-commit> node packages/bubblekick/build-server.mjs /path/to/source
```

The generated, ignored `dist/bubblekick-server` includes only server/shared code and the locked ws dependency. Its Dockerfile uses Node 24.19.0. Deploy explicitly to Cloud Run, with `ALLOWED_ORIGINS` set to the exact immutable title origins (comma separated). Serve TLS through Cloud Run; do not expose the reference development server or its static routes.

Use one instance, one CPU, 512MiB, CPU always allocated, 128 concurrent requests and a 3600-second timeout. The live service name is `akeru-bubblekick` in project `backbone-backend`, region `us-east4`. No build/test starts a deployment.

The runtime caps 32 rooms and 128 connections; limits upgrades, control messages, payload size and output backpressure; requires a timely protocol handshake; pings connections; and clears stale movement after 500ms. Origins are restricted, but a room code is an invite convenience, not account authentication. No public room browser is provided. Rooms disappear when empty or on restart. A disconnected player gets AI takeover; reconnecting into an active match is not supported. Updates can interrupt rooms, so avoid deployment during playtests.

The service emits aggregate connection snapshots and ended-connection durations, without player names, IPs or room codes. Cloud Run request/resource metrics are picked up automatically by the local Akeru Operations dashboard's `akeru-*` discovery.

Explicit multiplayer smoke test (creates temporary rooms and closes them):

```
node packages/bubblekick/server/smoke.mjs wss://<service>/ws https://<allowed-title-origin>
```

Checks Origin denial, host-only start, two-client snapshots, room isolation and disconnect cleanup. Physical Backbone/mobile performance needs real-device acceptance.

## Controller input

The host-selected Backbone/browser controller drives menus and gameplay through the shared input contract. The adapter retains button edges until a game frame consumes them, so short presses between frames are not lost. Pause clears pending input. The Backbone Home button remains host-owned.

- Left stick / D-pad: move and navigate menus.
- A: confirm, shoot (hold to charge), tackle.
- B: back / pass.
- X: lob.
- Y / RB: switch player.

Regression coverage includes short presses, held buttons, standard mappings and input clearing. Browser integration checks cover the title-to-match flow and gameplay via both browser Gamepad input and the native host input command. Physical Backbone acceptance is still required.

### Online rooms and responsiveness

The title-specific build patches provide typed four-letter room codes, live team
rosters, character selection and host-owned bot fill. The server limits each team
to four humans. Without bots, empty slots (including goalkeepers) are absent from
rendering, physics and player switching; tied matches end in a draw. A bot-free
match requires a human on each team. Single-player-per-device online input follows
the most recently used keyboard, touch or host-provided controller.

Snapshots run at 30 Hz. Local movement uses the shared movement integrator and
replays unacknowledged inputs after each authoritative checkpoint. Other players
use a one-snapshot interpolation buffer. Scoring, contacts and match rules remain
server-owned. Prediction stops after 30 outstanding inputs, rather than letting a
lost connection simulate indefinitely. Internet latency still affects server
confirmation of contacts and goals.

After building both artifacts, run `node packages/bubblekick/verify-runtime.mjs`
for bot isolation, delayed-reply prediction, input reconciliation, pause, room
joining, team capacity and host-only controls. This uses only a loopback server.
The player-following broadcast camera uses smooth tracking, bounded ball lead and
a closer view of the surrounding pitch and stands. The root check covers player
and nearby touchline visibility at phone/tablet/desktop sizes.
