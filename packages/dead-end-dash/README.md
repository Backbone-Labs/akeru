# Dead End Dash

A 60-second co-op maze dash, integrated through Akeru's isolated title protocol.
The game stays in its own repository. This package holds only the build recipe
and the adapter; the build pins one commit of that repository and reads an
explicitly supplied checkout of it.

```sh
node packages/dead-end-dash/build.mjs /path/to/dead-end-dash-checkout
node packages/dead-end-dash/preview.mjs
```

Online parties need a second build of the same checkout, the party relay.
That is described under [Online parties](#online-parties) and in
[`server/README.md`](server/README.md).

Open the printed `/play/dead-end-dash` URL. The normal evaluation catalog
(`examples/catalog-demo/playable.mjs`) also lists the title once it is built.
The preview runs loopback servers only. Nothing here publishes the game,
deploys anything or changes a deployed URL.

## What the build does

`pinned.mjs` pins the source once for both recipes: the repository it comes
from, one commit of it, and a digest of the files each recipe reads from that
commit (`sourceDigest` for the title, `serverDigest` for the party relay). A
recipe refuses a checkout whose `HEAD` is another commit, whose `origin` is
not the pinned repository, or whose files hash differently. The `origin` check
compares a string in the checkout's configuration; it does not contact GitHub.
The digest is what ties a build to bytes that were reviewed: Git does not
re-verify object ids on every read.

Nothing from the checkout is run. The working tree is never read, so local
edits have no effect and no clean filter or hook has a reason to fire; Git is
invoked with plumbing commands only, with replacement objects and the
filesystem-monitor hook off. Committed files are bundled with the root's
pinned esbuild into ignored `dist/dead-end-dash/`, and the hash of every
source file read and every artifact written goes into `build-record.json`.
The output does not depend on where the repository or the checkout sits.

To move to a newer revision of the game, change `revision` and both digests
in `pinned.mjs` together; a build with a stale digest fails and names the
digest it read. Review the game's diff before accepting those values.

The game's own build inlines its stylesheet and typeface. A title origin
admits neither, so here the stylesheet is a linked file and the game is told
not to create a `<style>` element. The bundle is built for the game's
`embedded` target, which leaves out its own controller polling, its
IndexedDB store and the transport it uses on another kind of host page; a
unit test checks the built file for gamepad polling, browser storage, inline
styles and that transport. The game's on-screen pad is never shown; a browser
test checks that.

### The typeface: a decision for review

The typeface (Pixelify Sans, SIL Open Font License 1.1) is the only third-party
file. Title origins are currently served without a `font-src` directive, so a
plain `@font-face` rule is refused. The adapter instead fetches the two
`.woff2` files as same-origin data artifacts and registers them with the
`FontFace` API, which the title policy does not forbid but does not spell out
either. That fetch is the only reason this title asks for `assetRequests`
(`connect-src 'self'`). The bytes are hashed artifacts of this title, copied
unmodified from `@fontsource/pixelify-sans` 5.3.0, with the licence text
beside them as `OFL-Pixelify-Sans.txt`.

This has been checked in Chromium only, and it is the one place the adapter
relies on something the policy leaves unsaid. The cleaner form is a platform
change that grants titles `font-src 'self'`, after which this becomes an
ordinary `@font-face` rule. If the workaround is not wanted in the meantime,
remove `loadTypeface` from `src/title.js` and set `assetRequests` to `false`
in `catalog.mjs`: the game falls back to the system monospace face and
nothing else changes.

## Controls

Left stick or D-pad moves. A jumps. X, B or RT shoves. Y, LB or RB pings. View
opens the game's own menu. Menu opens Akeru's and pauses the game; Home is
never read. In menus the stick or D-pad moves the highlight, A selects and B
goes back. The game's How to Play screen shows these bindings.

Touch uses Akeru's on-screen controller during a dash and the game's own
tappable menus and map otherwise; the adapter asks for the overlay only while
a dash is on screen. The game's own touch pad and its HUD pause button are not
shown: Akeru's menu button occupies that corner of the player.

The keyboard stays with the game's frame: WASD or arrows move, Space jumps, J,
X or Shift shoves, E or K pings, Esc or P opens the game's menu.

Host input arrives only when it changes, so the adapter keeps the last
snapshot until the next one, a host pause, a hidden page or a lost controller,
each of which leaves nothing held. A button that arrives already down within
150 ms of play resuming is taken to have been held through the pause (the A
that closed the app's pill, for instance) and is ignored until it is released.
The Backbone app's bridge and Akeru's on-screen controller both report
themselves as `touch`; the game is told they are a controller so that its menu
highlight follows them.

## Pause, sound and the pill

Akeru's pause stops the simulation, the dash clock and sound. A solo dash does
not restart under the player when the host menu closes: the game waits behind
its own pause screen. A party's dash is shared and carries on; only the local
player's game and input stop, and they return straight into the dash.

Sound starts on the first press where the browser allows it. Checked by hand
under Chromium's strict autoplay policy, outside the automated spec (which
cannot avoid granting a gesture): with no gesture anywhere on the page a
simulated controller press did not start sound and the title screen said so; a
click inside the game started it; once the shell page had been clicked, the
press alone started it. Not tried with a physical controller.

The pill's sound switch is the player's own setting and is saved. Its status
is `on` only when sound is running, or was running when the pause began;
sound the browser never let start is reported as `blocked`, with the advice
to tap the game. Save and save-status write anything unsaved and report it.
Restore is refused: the game saves a descent at each huddle and has no
snapshot of a dash in progress. Restart returns a solo descent to the title
screen and keeps it; a party cannot be restarted from the pill.

## Progress

A solo descent as of its last huddle, lifetime records and settings are kept
together in the host's title-scoped `progress` slot (schema version 1) and
written with the revision the host last gave. A slot that cannot be read, a
refused write or a newer save from another window stops writing for the
session: the stored bytes are left as they are, the game says saving has
stopped, and play continues from memory. There is no cloud sync and no account.

## Online parties

Parties are off. `src/network-config.js` holds `null`, so the title is given
no relay, and Host a Party and Join a Party say that parties are not switched
on here; solo play is unaffected.

The game's netcode is its own: players exchange small keyed values through a
presence relay, each player's game keeps the state, and the relay keeps none.
Akeru's host-owned rooms run an authoritative simulation, which this game
does not have, so the title needs a small service of its own, deployed
separately the way Mythic Kitchen's server is. This package builds it, from
the same pinned commit as the title:

```sh
node packages/dead-end-dash/build-server.mjs /path/to/dead-end-dash-checkout
```

That writes ignored `dist/dead-end-dash-server/`: the game's relay, an entry
point and admission policy that belong to this package, the WebSocket package
the root lockfile records, a `Dockerfile` and a record of every file. It
builds no image and deploys nothing. What the service admits, its limits, how
it would be deployed and how parties are then switched on are in
[`server/README.md`](server/README.md). **Nobody has deployed it.** Until
someone with release permission does, and commits the service's address to
`src/network-config.js`, parties stay off.

For local evaluation, run the built relay on a loopback port and bridge it
onto the title's origin:

```sh
TITLE_ORIGINS=http://127.0.0.1:8787 PORT=8787 HOST=127.0.0.1 \
  node dist/dead-end-dash-server/index.mjs
# in another terminal
AKERU_DEAD_END_DASH_RELAY_PORT=8787 node packages/dead-end-dash/preview.mjs
```

With that variable set, the preview serves a `network-config.js` that points
the title at its own origin and bridges `/ws` there with the creator
preview's `local-network.mjs`, which accepts only upgrades from that title's
origin and forwards them to the named loopback port. A party code is six
letters. A party shares each player's chosen name, colour and what their
dasher does in the maze; there are no accounts and nothing is stored. This is
not a Backbone friends integration, and party codes are an invitation, not a
secret: anyone who has one can join until the party is full.

## Validation

```sh
npm run check
npx playwright test tests/browser/dead-end-dash.spec.mjs
```

Two unit test files run everywhere, without the game's source.
`tests/dead-end-dash.test.mjs` covers the input mapping and its bounds,
malformed payloads, held-input and carry-over rules, each check of the message
gate on its own, the save codec and conflict handling, the pill actions and
sound states, the party address the title will accept, and the title recipe
against a stand-in checkout: a good build, its manifest and rights fields, and
refusals for the wrong commit, repository or bytes, replacement objects,
commands configured in the checkout, links, outside imports and stylesheets
that fetch. `tests/dead-end-dash-server.test.mjs` covers the relay's admission
policy, the relay recipe against the same stand-in (a good build with every
file recorded, and refusals for the wrong commit, repository, bytes or `ws`
version, a relay that imports anything else, and uncommitted edits), and the
built entry point running around a stand-in relay: the health check, no file
served, every refused origin and path, the limits it passes on, a clean stop.
Further tests in both files inspect the real builds when they are present:
the title bundle, and the real relay with two guests forming a party, a
stranger's attempts, an oversized message, a restart and per-address counting.

The browser spec runs the built title in the local catalog shell: controller
menus and a solo dash, both menus, controller loss, a forged message, saves
across a reload, the Backbone pill and bridge, parties reported as off, an
unreadable save, a launch outside the shell, the touch overlay and, when the
relay has been built too, a two-player party through it that survives the
relay being stopped and started again. It skips when the title has not been
built; a skip is not gameplay validation.

The controller in these tests is a simulated standard gamepad and the pill is
a simulated app bridge, in Chromium. A physical Backbone, Bluetooth
controllers, iOS and Android WebViews, WebKit and Firefox, phone touchscreens
and an approved production host have not been tested with this title.

The title exposes its game object as `window.__ded` inside its own frame for
these tests and for bug reports.

## Rights and publication

The game's code, its pixel art (drawn in code) and its synthesised sound were
produced with an AI coding assistant at the owner's direction. No human
artist or lawyer has reviewed them, and the game's repository grants no
licence. Source and asset rights are therefore recorded as `unknown`, the
catalog options carry `publicationBlocked`, and a local build cannot enter the
public preview packager. Pixelify Sans is recorded as `OFL-1.1` with its
upstream project and package as evidence, and Akeru's save client as `MIT`.
The catalog shows the account that holds the pinned source as the creator; no
display name is invented.
