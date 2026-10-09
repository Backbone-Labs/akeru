# Dead End Dash party relay

Dead End Dash parties do not use Akeru's host-owned rooms. Each player's game
keeps the state; a small relay forwards the latest value of five keys between
the players in a room and remembers nothing else. This directory is the part
of that service which belongs to Akeru: who is admitted, how much one instance
carries, and how the runtime is put together. The relay itself is the game's
`server/relay-core.mjs`, read from the same pinned commit as the title.

**Nothing here has been deployed, and nothing here deploys.** The recipe
writes a directory. Building an image from it, running it somewhere public
and pointing the title at it are steps for someone with release permission.

```sh
node packages/dead-end-dash/build-server.mjs /path/to/dead-end-dash-checkout
TITLE_ORIGINS=http://127.0.0.1:8787 PORT=8787 HOST=127.0.0.1 \
  node dist/dead-end-dash-server/index.mjs
node --test tests/dead-end-dash-server.test.mjs
```

## What the recipe builds

`build-server.mjs` opens the checkout through `../pinned.mjs` (pinned
repository, pinned commit, committed objects only, nothing from the checkout
run) and writes ignored `dist/dead-end-dash-server/`:

| File                    | From                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `relay-core.mjs`        | the game, at the pinned commit, byte for byte                  |
| `index.mjs`             | this directory: the HTTP server around the relay               |
| `policy.mjs`            | this directory: admission and this deployment's limits         |
| `node_modules/ws/`      | the installed package the root lockfile records, whole         |
| `package.json`          | generated: Node 24.21.0, `ws` at the locked version            |
| `Dockerfile`            | generated: pinned base, unprivileged user, no install step     |
| `runtime-evidence.json` | the pin, the lockfile entry for `ws`, and a hash of every file |

It refuses a checkout that is not the pinned commit of the pinned repository,
source that does not hash to `serverDigest`, a relay that imports anything
but `ws`, and a game that names a different `ws` version from the one the root
lockfile records. It also refuses relay source that mentions `process`,
`require`, `eval`, `Function`, `globalThis` or a dynamic import. That last
check is a tripwire for an honest change, not a sandbox: the digest is what
ties the build to bytes somebody read.

The runtime contains no title files, no game logic and none of the game's
standalone server. It has no install step: the image is the directory.

## What the service does

- `GET /health` answers `ok`. Every other path is `404`. No file is served.
- `GET /ws` with a WebSocket upgrade is admitted only from an origin listed in
  `TITLE_ORIGINS`. Anything else is answered `403` before the relay sees it:
  another origin, no origin, another path, a query string.
- An admitted connection must join or open a party within ten seconds, by
  sending the party code. After that it may set five keys (its player's name
  and colour, motion, a run ledger, map flags, and host state) and is sent the
  other players' values for those keys. Nothing else is carried.
- On `SIGTERM` it closes every connection with code 1012 and exits.

The relay holds no accounts, no credentials and no game state, and stores
nothing. It writes a line or two when it starts and nothing per player. What
passes through it is each player's chosen display name and colour and what
their dasher does. Do not send it anything else: there is no place for
secrets in this protocol.

### Limits

| Limit                                         | Value                                                    | Set in       |
| --------------------------------------------- | -------------------------------------------------------- | ------------ |
| Open connections                              | 256                                                      | `policy.mjs` |
| Parties                                       | 128                                                      | `policy.mjs` |
| New connections, everyone together            | a burst of up to 256, then 20 a second                   | `policy.mjs` |
| Players in a party                            | 8                                                        | the relay    |
| Message size                                  | 8 KiB                                                    | the relay    |
| Messages from one connection                  | about 80 a second; the rest are dropped                  | the relay    |
| Time to join a party after connecting         | 10 seconds                                               | the relay    |
| Unread data before a slow reader is cut loose | 256 KiB                                                  | the relay    |
| Silent connection                             | dropped after a missed ping (10 to 20 seconds)           | the relay    |
| Code attempts from one address                | **off** unless `FORWARDED_HOPS` is set; then 20 a minute | the relay    |
| Open connections from one address             | **off** unless `FORWARDED_HOPS` is set; then 24          | the relay    |

Past a limit the relay refuses (`503` or `429` to a new connection, a one-word
error to a party request) rather than queueing. The burst is as large as the
connection limit on purpose: after a restart every player reconnects in the
same second and tries only five times.

The last two rows are off in every configuration this has been run in. With
them off, nothing tells one machine from many: a single program can take
every seat or every party slot and keep the rest of the players out for as
long as it stays connected. See `FORWARDED_HOPS` below.

### What this is not

Origin is a browser boundary, not authentication. A program that is not a
browser can send any `Origin` and speak the protocol. There is no server
authority either: a modified client inside a party can cheat or take the host
role. The game validates and bounds every value it receives from another
player and renders names as text only, but this is built for people who were
given a code, not for ranked play or strangers.

One thing a party member cannot do is put another player out. Everyone in a
party is told everyone's id, and a reconnecting client takes its old seat
back by id; so each client also sends the relay a private key when it joins,
which is passed on to nobody, and a seat is given up only to the same key.

A party code is an invitation, not a secret. It is six letters from a
24-letter alphabet (about 190 million codes), drawn from the browser's
cryptographic random source, and anyone who has it can join until the party
is full. What stands between a stranger and a party is the size of that space
and how fast codes can be tried. With the per-address limits off, the brake
is the connection rate above: at 20 attempts a second with 100 parties open,
finding any one of them would take about a day on average, and for that day
nobody else could connect reliably either. That is arithmetic, not a test.
Nobody has attacked this service, and nobody has run it on its real host.

## Configuration

| Variable         | Meaning                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TITLE_ORIGINS`  | Required. The exact origins the title is served from, comma-separated. HTTPS only, apart from `http://127.0.0.1:<port>` for local evaluation. No wildcards, paths or trailing slashes. The service does not start without it. |
| `PORT`           | Default 8080.                                                                                                                                                                                                                 |
| `HOST`           | Default: all interfaces. `127.0.0.1` for local evaluation.                                                                                                                                                                    |
| `FORWARDED_HOPS` | Optional. Where a player's address is, counted in proxies: `0` if players connect straight to the process, `1` if one proxy you run is in front and writes the last entry of `X-Forwarded-For`, and so on.                    |

`FORWARDED_HOPS` decides whether the two per-address limits are on. Behind a
proxy the socket's own address is the proxy's, every player shares it, and a
per-address limit would let one person guessing lock everybody out. So,
unset, those two limits are off and the service says so when it starts.
Set it only after checking, for the platform in use, which entry of
`X-Forwarded-For` the platform itself writes; an entry further left than
that is whatever the sender typed. Set too high, the address being counted
is one the sender chooses: they can dodge both limits, or spend another
address's allowance and lock that player out. The right value for Cloud Run
has not been established here, and the reading of the header has been tested
only with headers the tests wrote.

## Deploying it

This follows the notes in `packages/mythic-kitchen/server/README.md`, the
other title with a server of its own. Deploy only with explicit release
permission, never from `build` or `check`.

- A dedicated service, with a runtime service account that has no API
  permissions. The runtime needs none.
- An image built from `dist/dead-end-dash-server/` (`docker build` in that
  directory), deployed by digest. The image has not been built here: this
  environment has no container daemon.
- Port 8080, health path `/health`.
- **One instance at most.** Parties live in one process's memory. Two
  instances would put players with the same code in two different rooms.
  Do not raise the maximum or split traffic between revisions.
- Request concurrency above the connection limit, for example 300: each open
  WebSocket counts as one request.
- The longest request timeout the platform allows. When it cuts a
  connection, or when the service restarts or is redeployed, the title
  reconnects by itself and the party continues: see below.
- CPU allocated for the life of the instance, not only while a request is
  being answered: a WebSocket is one long request.
- `TITLE_ORIGINS` set to the title's deployed origin.
- A decision on `FORWARDED_HOPS`, made before the address is public: either
  the platform's hop count, confirmed with a request through the deployed
  service, or left unset in the knowledge of what that leaves open (above).

A minimum of zero instances is possible, because the relay holds nothing
between parties. The first player to host after an idle period would then
wait for a cold start, which has not been measured.

### Restarts

A restart ends connections, not parties. The players' games hold the state;
each reconnects on its own (five attempts over about eleven seconds), asks for
its party by code, and the room forms again with one host. A fresh instance
admits a full house at once. In the browser
test, two players in a party lose the relay, get it back on the same address
and carry on in the same descent. On a deployment that keeps the old instance
up until the new one is serving, players should therefore see no more than a
brief "Reconnecting…" note; that has not been tried on a real deployment. If
the relay is gone for longer than those attempts, each player is told the
connection was lost and returned to the title screen. Solo play never touches
the relay.

### Size

Measured with `scripts/relay-load.mjs` from the game's repository at the
pinned commit, against this runtime, on a two-core development container:
over loopback, without TLS, and with the load generator on the same two
cores. Stand-in players send what a player's game sends during a dash
(motion 15 times a second, a ledger once a second, host state every two
seconds).

| Load                                 | CPU, of one core | Memory  | Motion delay, median / 99th |
| ------------------------------------ | ---------------- | ------- | --------------------------- |
| 256 connections: 32 parties of eight | 37%              | 103 MiB | 1 ms / 5 ms                 |
| 256 connections: 64 parties of four  | 27%              | 133 MiB | under 1 ms / 2 ms           |

Both were one run of twenty seconds each, in that order, on the same process,
with nobody refused or dropped. One vCPU and 512 MiB is therefore a
reasonable starting size. It is not a measurement of the real host: nobody
has run this on Cloud Run or over a real network, and a phone on a mobile
connection is not a loopback socket.

## Switching parties on

After the service is deployed and answering:

1. Set `packages/dead-end-dash/src/network-config.js` to the service's
   address, in the exact form `wss://<host>/ws`, and commit it. The title
   accepts nothing else: a malformed address there fails
   `tests/dead-end-dash.test.mjs`, and in a browser would leave parties off
   rather than connect somewhere unexpected.
2. Rebuild the title, so that the build record hashes the file that ships.
3. Allow that one `wss://<host>` destination in the deployed title's
   `connect-src`, beside `'self'`. Nothing in this repository does that: the
   public packagers give a title `'self'` or nothing.
4. Update the catalog text in `catalog.mjs` that says parties are not
   switched on, and the "parties are off" browser test.

## Release acceptance

Not done, and not possible from a development machine:

- public `/health`, and a `403` for an origin that is not the title's;
- two phones on different networks hosting and joining by code through the
  deployed title, playing a dash, and seeing each other move;
- a party of eight;
- the service redeployed while a party is in a huddle and again mid-dash;
- a phone locked and unlocked, and the app's pill opened, mid-party;
- the per-address limits, if `FORWARDED_HOPS` is set: a party still forms from
  two phones on one Wi-Fi network, and repeated wrong codes from one phone
  are refused without affecting another;
- a pass with a physical Backbone on iOS and Android.

## What has been tested

`tests/dead-end-dash-server.test.mjs`, in Node, on loopback:

- always, with a stand-in checkout and a stand-in relay: the admission
  policy; the recipe's output, record and refusals; and the built entry point
  running from a directory outside the repository (health check, no file
  served, every refused origin and path, the limits it hands the relay, a
  clean stop, no start without `TITLE_ORIGINS`);
- when the real runtime has been built: that it is the pinned relay behind
  the current entry; two guests forming a party and exchanging values; a
  stranger's wrong code and attempt to take a code in use; a member's attempt
  to take another member's seat; an oversized message; a restart; 256
  connections admitted in one burst, the next refused, and later arrivals
  held to the rate; and per-address counting with and without
  `FORWARDED_HOPS`.

`tests/browser/dead-end-dash.spec.mjs`, in Chromium, when both builds are
present: two players in the local catalog shell form a party by typing the
code, lose the relay, get it back, and play a dash together. That path goes
through the local preview's same-origin bridge. A browser connecting across
origins to a deployed `wss://` address, with the deployed title's real
`Origin` and connection policy, has not been exercised anywhere.

The relay's rooms and each of its limits are tested in the game's own
repository (`test/relay.test.mjs` there).
