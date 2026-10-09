# Operation Blackline local multiplayer

Two to ten guests join a private room by invite, ready up, and play a bot-filled
5v5 match. The owner starts the match and rematch. Keyboard/mouse, standard
controllers, and simultaneous touch sticks/buttons use the same server authority.

## Run

Use the repository-pinned Node/npm versions and `npm ci --ignore-scripts`, then:

```sh
npm run preview:multiplayer
```

This prints one catalog URL containing Kart and Blackline, with separate local
workers. Both guests must use the same preview server. For two devices on the same
Wi-Fi, set `AKERU_LAN_HOST` to this machine's private IPv4 address before running.
A localhost invite only works on the host machine. Browser gamepad availability on
plain LAN HTTP varies; use touch there or a trusted HTTPS development proxy for
controller testing. The preview does not expose an Internet service.

```sh
npm run test:blackline-multiplayer
npx playwright test --config playwright.blackline-webkit.config.mjs
```

Set `BLACKLINE_TEST_REDIS_URL` to an isolated test Redis instance to exercise
cross-worker room discovery and routing. Never use production Redis for tests.

## Boundaries and architecture

- The title requests `multiplayer.rooms.v1`. The trusted catalog separately grants
  a title/build-specific room broker and endpoint. Games cannot select endpoints,
  open sockets, or read session/reconnect credentials.
- A Colyseus room owns the roster, readiness, team assignment, countdown, match,
  bots, score, ammunition, respawns and results. Inputs carry intent and a monotonic
  sequence; client position, damage, identity and shot origins are rejected.
- The server runs pinned upstream player collision/physics at 60 Hz and sends
  per-player snapshots at 20 Hz. The client predicts the same fixed 60 Hz movement,
  sends control changes at 30 Hz, and replays only ticks not yet acknowledged by
  the server (including partially consumed held inputs). Reconciliation corrects
  physics immediately while a short camera offset removes visible rewinds.
  Remote players use a buffered server-time timeline rather than arrival-time
  interpolation. Respawns, reconnects and stale snapshots reset or discard history.
  Server-side shot rewind and production load profiling remain future work.
- Private rooms accept 10 clients, validate build compatibility and exact messages,
  rate-limit traffic, reject unapproved origins, expire after 30 minutes, and allow
  a 30-second reconnect window. Hosts can leave without deleting other guests;
  ownership transfers. The lobby remains usable while host gameplay is paused.
- Separate worker processes isolate the two games. With Redis presence/driver and
  routable `PUBLIC_ADDRESS`, room discovery works across workers. Rooms remain
  pinned to one worker; a crashed worker does not migrate a live match. Redis
  clusters for different titles should use separate Redis databases/instances.
- `SHELL_ORIGINS`, TLS termination, per-worker routing, process supervision,
  operational limits, monitoring, capacity testing and native Backbone party
  invites are deployment work, not enabled by this local preview. This PR does not
  modify native apps, production services, or publication approvals.

## Source and rights

The builder reads hash-inventoried sources at
`TheFadGhost/operation-blackline@8533717e4ebfadcc106d96414389aae314e3cdc2`,
whose repository includes an MIT license. It preserves the upstream license in
local artifacts. Three.js is pinned separately to upstream-compatible 0.169.0 and
its license is included. Generated source/assets stay under ignored `dist/`.
Source and asset publication review is **pending**; no approval is inferred from
the manifest, license declaration, or successful tests.

Guest settings persist through the host save interface. A live match is not a
save state; no account or cloud save integration is added.
