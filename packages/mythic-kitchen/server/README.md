# Mythic Kitchen multiplayer runtime

Build the runtime from the explicitly supplied, authorized creator checkout:

```sh
node packages/mythic-kitchen/build-server.mjs /path/to/creator-checkout
TITLE_ORIGINS=http://127.0.0.1:4174 PORT=8080 node dist/mythic-kitchen-server/server/index.js
node --test tests/mythic-kitchen-server.test.mjs
```

The recipe verifies the pinned source revision, includes only the authoritative
server and shared simulation, removes static file serving and the stub fallback,
and copies the exact installed WebSocket dependency recorded in the root lockfile.
Private creator source and runtime artifacts stay in ignored `dist/`.

The public server is for guests: no account credentials are passed to game code.
A browser may connect only from an explicitly approved immutable title origin.
Origin validation is not authentication for non-browser clients. Room codes are
invitation conveniences, not protection for sensitive data. Never send secrets or
personal account data over this protocol.

Limits: 16 rooms, 64 sockets, four players per room, 16 KiB messages, bounded
outbound buffers, control-message and gameplay-input rates, 30-minute room expiry,
heartbeat cleanup, and neutral input after 300 ms without an update. Only the host
can start a room; all players must be ready. Host ownership moves on disconnect.
The shared server clock continues when a guest opens their pill or backgrounds
the app. Local input is cleared; old input also expires on the server.

## Initial Cloud Run release

Use a dedicated service (`akeru-mythic-kitchen`), a runtime service account with
no Google API permissions, a pinned image digest, port 8080, health path `/health`,
1 CPU / 512 MiB, instance-based CPU allocation, minimum 1 / maximum 1 instance,
concurrency 64 and timeout 3600 seconds. Deploy only with explicit release
permission, never from `build` or `check`. Set `TITLE_ORIGINS` to the deployed
immutable Kitchen title origin. Configure the title's `network-config.js` with
the exact `wss://<service-origin>/ws` endpoint and grant only that WSS destination
in its deployment CSP. The host shell URL and `/play/mythic-kitchen` stay stable.

This initial deployment has **in-memory rooms and one serving instance/revision**.
It does not provide durable rooms or horizontal routing. Restarts/deployments end
rooms, and even a one-instance limit can briefly overlap replacements. Do not
increase instance counts or split revision traffic: different instances cannot
join each other's rooms. A scalable follow-up needs room-to-worker routing,
shared presence, admission/draining and load tests; generic load balancing or
session affinity alone is insufficient.

Release acceptance: public `/health`, rejected unlisted origins, two independent
clients on the public endpoint creating/joining/readying/moving, background/input
expiry, disconnect, host migration, and a phone pass through the Backbone pill.
Only then hand off the stable game URL for Retool.
