# Creator game evaluation

Westwick Manor and Mythic Kitchen use the same isolated title protocol, selected
controller, touch overlay and title-owned host save namespace as other Akeru
packages. The game implementations remain in their authorized private checkouts;
only integration recipes and adapters are tracked here. Regular builds/CI do not
fetch private sources or activate these titles.

With the root's pinned Node/npm installed, run `npm ci --ignore-scripts`, then:

```sh
node packages/westwick-manor/build.mjs /path/to/westwick-checkout
node packages/mythic-kitchen/build.mjs /path/to/kitchen-checkout
node packages/creator-preview/preview.mjs
```

Each recipe pins its source revision, reads committed files through Git, refuses
tracked working-tree changes, rewrites module paths for content-addressed isolated
origins, bundles the root's pinned Three.js, and records artifact hashes. Patches
fail when their anchors change. Source implementations and screenshots remain in
ignored `dist/`. Run the command's printed `/games` URL to browse both titles, or
`/play/westwick-manor` and `/play/mythic-kitchen` for the app-style direct player.
The normal evaluation catalog also includes these titles when they are built.

## Controls and progress

- Manor: left stick/D-pad moves, right stick aims, RT/X attacks, LT uses the
  Keeper ability, A interacts/banishes, B dashes, Y uses the selected consumable,
  LB/RB cycles consumables and View toggles the map.
- Kitchen: left stick/D-pad moves, A picks up/puts down, held X/RT works
  (chop/wash/extinguish), B dashes, Y switches the solo chef.
- Both: stick/D-pad navigates menus, A selects, B goes back, Menu opens Akeru's
  menu. Original keyboard/mouse controls remain. Touch uses Akeru's two sticks
  and action buttons plus tappable game menus. Room names/codes use text entry.
- One host-selected gamepad is supported. Kitchen local player two retains its
  original keyboard controls; simultaneous two-controller routing is not added.
- Host pause, controller disconnect, focus loss and backgrounding clear held
  controls. Online games continue on the server while the local menu is open.
- Manor saves floor checkpoints, character/relic choices and meta progression;
  continuing restarts that floor with its original layout seed. Kitchen saves earned stars, level unlocks and
  preferences; rounds restart. Neither advertises exact snapshot/cloud saves.
- A title-local synchronous storage facade reads/writes the host's `progress`
  slot. Malformed saves and write failures preserve existing bytes and display
  a saving-unavailable message instead of overwriting progress.

## Optional local online lobbies

The existing creator servers are separate from the static game files. Install
and run each authorized checkout using its own lockfile (`npm ci --ignore-scripts`)
and its `server/index.js`, choosing separate local ports with `PORT`.
Then enable the local-only WebSocket bridge explicitly:

```sh
AKERU_MANOR_SERVER_PORT=3002 AKERU_KITCHEN_SERVER_PORT=3000 \
  node packages/creator-preview/preview.mjs
```

The bridge accepts only `/ws` upgrades from that isolated title's origin,
connects to an explicitly supplied loopback port and does not forward cookies or
authorization headers. There is no query-controlled destination and no proxy in
production packaging. Each server retains its own rooms and authoritative
simulation; the browser still uses its original prediction/interpolation.
Without the optional servers, solo/local modes work; Online reports that the
server is unavailable. This is not a public multiplayer deployment or a Backbone
friends integration.

## Verification and publication

```sh
npm run check
npx playwright test tests/browser/creator-games.spec.mjs
AKERU_MANOR_SERVER_PORT=3002 AKERU_KITCHEN_SERVER_PORT=3000 \
  npx playwright test tests/browser/creator-games.spec.mjs
```

Source-dependent browser tests skip in public CI when the private artifacts are
absent. Unit tests still cover input mappings, storage isolation, malformed
saves, source pin refusal and local network boundaries. Run the opt-in browser
suite locally before reviewing a release; a skip is not gameplay validation.
Physical Backbone/Bluetooth, iOS WebView and Android device acceptance remains
separate from the simulated-standard-controller browser tests.

The creator states that these are original games. No source license file was
present in the evaluated checkouts, so source/asset rights remain `unknown` and
both options carry `publicationBlocked`. These local builds cannot silently
enter the public preview packager. Public source/asset distribution and server
hosting need their own explicit release setup. Existing public game IDs, URLs
and Doom builds are unchanged.
