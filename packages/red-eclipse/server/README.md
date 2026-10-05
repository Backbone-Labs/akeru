# Red Eclipse multiplayer relay

The container builds a native standalone server from Red Eclipse source commit
`faf378d12558addc700d0e464e7e8c3a39fbceee`. The engine remains authoritative;
each browser WebSocket maps to its own UDP socket, connected only to
a server-assigned loopback port for the selected room. No arbitrary destination or public UDP port is exposed.
The native ENet build additionally rejects non-loopback destinations.

`service.cjs` requires `ALLOWED_ORIGINS`: a comma-separated list of exact HTTPS
**title iframe origins**, not just the catalog origin. Wildcards, opaque origins,
missing origins, query strings and alternate paths are rejected. Origin validation
prevents cross-site browser use; it is not player authentication. Guest sessions
remain supported.

Limits: four concurrent rooms, eight peers per room, 65,507-byte binary messages, 32 queued datagrams before UDP
connect, 500 incoming datagrams/second and approximately 1 MiB/second per peer,
1 MiB outbound WebSocket queue, and 30-second heartbeat. Native ENet peers use
a bounded 120–180 second acknowledgement grace and the initial game negotiation
expires after 180 seconds, allowing first-load browser map/shader compilation. Compression is disabled.
`GET /ready` reports coordinator readiness. Creating a room waits for its native engine to announce startup; an image build also creates a real room as a smoke check. Native failure removes only that room. SIGTERM disconnects clients and stops all room engines.

## Reproduce an isolated container context

Use the repository's pinned Node/npm and root lockfile. No separate dependency
lock is maintained. The workspace depends on exact `ws` 8.21.0.

```sh
npm ci --ignore-scripts
node packages/red-eclipse/server/prepare-context.mjs "$REVIEWED_RELEASE_DATA" "$NEW_SERVER_CONTEXT"
docker build -t akeru-red-eclipse "$NEW_SERVER_CONTEXT"
```

The context preparer copies only server source, root package metadata/lock,
Fortitude map geometry/config/waypoints, and release credits/license evidence.
It refuses an existing output directory. Review the release manifest and rights
before invoking it; existence of a manifest is not publication approval.
The script does not invoke Cloud Build, deploy, change IAM, or modify services.
Third-party binaries and downloaded engine source remain outside public commits.

The source fetch uses the public upstream repository and an immutable revision.
Native compilation uses clang and zlib on Debian Bookworm. Base images and Debian
packages may receive patches, so this recipe is reproducible in functionality,
not a claim of byte-identical historical builds. Pin deployment image digests.

## Hosting

Deploy this as its own service with a dedicated runtime identity holding no
project roles. Configure a single always-on instance (minimum/maximum 1), 1 vCPU,
1 GiB, concurrency 40 and request timeout 3600 seconds. Start with authenticated
IAM and test before explicitly granting public invocation. Changing publication
or permissions is a separate action from building.

Each private room owns a separate native server process. The registry is in memory on this singleton instance. Cloud Run WebSocket requests
expire after at most one hour, and instances can restart. The game must display
a disconnection state and offer reconnect; ongoing match state is not a durable
save. A redeployment can interrupt players. Scaling beyond one instance requires
an external room directory and explicit instance routing rather than relying on sticky sessions.

Fortitude uses CC BY-SA 3.0; the prepared context includes credits and modifications.
Engine code has its upstream zlib license. Asset/branding clearance is independently
reviewed for the browser release. Restricted music is not bundled with the server.

## Room API and isolation

All room endpoints require an exact allowed Origin and JSON POST, with a 2 KiB request limit. Creation and join requests share a bounded rate budget. `POST /rooms` creates an 80-bit random invitation code, an independent 192-bit relay credential, and a separate creator credential. `POST /rooms/join` accepts a full code and returns the room relay credential when capacity permits. `POST /rooms/close` requires both the code and creator credential, revokes the relay credential, disconnects only that room, and stops its engine. No listing endpoint exists.

WebSockets require both `binary` and `room.<credential>` offered subprotocols; the selected response protocol is `binary`. The credential selects a room-owned UDP port, never an arbitrary request-specified destination. Unknown, expired, full, and credential-free joins are rejected. Empty rooms expire after ten minutes; active rooms remain until closed, restarted, or disconnected. Each server uses a separate temporary home, Fortitude, no bots, and no upstream master server.

`Dockerfile.rooms` is a fast application-layer build on the pinned immutable image produced by the complete source-build Dockerfile. It copies the coordinator and server configuration, then runs the same real-room startup check. Updating engine source or dependencies requires the full Dockerfile build and a newly reviewed pinned base.
