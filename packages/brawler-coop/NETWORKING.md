# Browser co-op

Brawler uses its existing host-authoritative game simulation and Godot RPCs. The web export substitutes an Akeru `MultiplayerPeerExtension` backed by secure WebSockets for ENet/UDP. A small Node relay creates six-character private rooms and assigns peer IDs; the browser hosting the room remains player 1 and runs the simulation. The relay does not run Godot, persist state or receive account credentials.

Create Room → share the code → friends choose Join Room → host selects Start Match. Up to four players may join before the match starts. Mid-match joins are refused. Rooms end when the host leaves, the service restarts, the application connection is idle for 60 seconds, or the room reaches 45 minutes. There is no host migration, automatic in-progress rejoin, durable match recovery, or cloud save. Keep the host game open and in the foreground. After a disconnect, create a new room. WebSocket reliability can add latency on poor connections; this is an initial co-op test implementation, not competitive netcode.

The existing game menu theme, typeface and native controls are reused. Room codes lead the room view, player slots show who joined, the start action waits for a second player, and gameplay touch controls are hidden in tappable menus. Inputs and buttons have larger mobile hit areas. The host menu neutralizes only that player's input during online play; it does not freeze other players. Only the host can restart the shared match. Restart first stops inputs, waits for peer acknowledgements, removes replicated players and enemies while the old scene is still present, then loads the new scene and resumes input after spawning.

## Local checks

```sh
BRAWLER_RELAY_URL=ws://127.0.0.1:60902/relay \
GODOT=/path/to/Godot \
GODOT_WEB_TEMPLATE=/path/to/web_nothreads_release.zip \
node packages/brawler-coop/build.mjs /path/to/creator-checkout
node --test tests/brawler-relay.test.mjs
npx playwright test tests/browser/brawler-coop.spec.mjs
```

The browser test starts an isolated loopback relay, admits only the fixture title origin, and exercises the exported game with two browser clients. It checks controller menu entry, shared positions, player movement while the host menu is open, host-only restart and host disconnect. Server tests cover room isolation, assigned sender IDs, capacity, invalid packets, disallowed origins, host-only room controls and expiry. For an explicit deployed acceptance run, set `BRAWLER_TEST_ORIGIN` to the HTTPS catalog origin; the same browser test creates a temporary room on that service.

## GCP runtime

`node packages/brawler-coop/server/package.mjs` creates an explicit container build context using the `ws` version pinned in the root lockfile. It includes only the relay, the installed dependency and its license, and the Dockerfile. It does not include game assets, creator source, credentials, or other project source. Normal builds do not deploy.

Deploy as a dedicated Cloud Run service using a runtime service account with no API roles. Set `BRAWLER_ALLOWED_ORIGINS` to the exact HTTPS title deployment origins (comma-separated). The public relay accepts only `/relay` WebSocket upgrades from those origins; `/healthz` returns readiness without room listings or connection data. No room content is logged.

For this in-memory test service: one CPU, 512 MiB, minimum zero instances, maximum one instance, concurrency 120 and a 3600-second request timeout. The application limits 24 rooms / 120 connections, bounds packet size, rate and outgoing buffers, refuses joins after start, expires rooms, and derives packet sender identity from the socket. Origin validation is a browser boundary, not account authentication; possession of the room code allows entry before start.

Do not scale this in-memory design horizontally without adding room placement/shared routing. Deployments and platform instance replacement can end active rooms. Keep older title origins allowed during a client transition; only the Brawler service and its title deployment need updating. The site catalog should replace Brawler's entry while preserving every unrelated title and the current shell files. Device acceptance on real Backbone, iOS and Android remains necessary in addition to browser tests.
