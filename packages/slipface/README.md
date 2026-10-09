# Slipface

An original sandboarding game: ride down a dune as far as you can on three
boards, with a new dune every day that is the same for everyone. Single-player,
Canvas 2D, no network. Integrated through Akeru's isolated title protocol.

The game source stays in its own checkout. This package tracks only the build
recipe, the catalog entry and the title adapter. The build pins source revision
`b5d95427df70196ecf6a2ebed469020e12bbdf06` and reads an explicitly supplied
local checkout; the game is emitted only into ignored build artifacts.

```sh
node packages/slipface/build.mjs /path/to/slipface-checkout
node packages/creator-preview/preview.mjs
```

Open the printed `/games` URL or `/play/slipface`. The normal evaluation
catalog (`examples/catalog-demo/playable.mjs`) also includes it once built.
Regular builds and CI do not fetch the source, and this does not publish the
game or change existing production URLs.

## How it is built

The recipe refuses a checkout at any other revision, with tracked changes, or
whose `origin` is not a GitHub repository. It reads committed files through
Git, starts at `src/game.js`, follows static relative imports and packages only
what that reaches, flattened for the content-addressed title origin. It applies
no patches: the game is the pinned source, byte for byte apart from import
paths, and every source and artifact hash is recorded in
`dist/slipface/build-record.json`.

The game takes everything it needs from outside through the `services` of its
`createGame`, so the adapter supplies those and nothing in the game is
rewritten. Its standalone page is what brings a Gamepad provider and an
IndexedDB store, and neither is packaged: the recipe stops if the entry reaches
those modules, or if any packaged module mentions a controller, storage or
network API. The built title has no route to a device except the host channel.
It has no asset files either; sprites, lettering, sound and music are drawn and
synthesized by its own code, and the title makes no requests (`connect-src
'none'`).

## Title adapter (`src/`)

- `title.js` owns the authenticated host channel (frame, origin, nonce and
  increasing sequence are checked on every message) and starts the game after
  the save slot has been read.
- `controls.js` maps the host's logical controls to the game's actions. Only
  the names the game uses are read, as bounded numbers.
- `progress.js` is the game's save store over the host's `progress` slot.
- `pill.js` answers title actions from the web pill and the native menu.

## Controls

Left stick or D-pad steers; the D-pad is a hard carve. A hops. RT, RB or D-pad
down tucks for speed. B, X, LT, LB or D-pad up brakes. In menus the stick or
D-pad moves, A selects and B goes back.

View opens the game's own pause menu (resume, restart, how to play, sound,
quit to title). Menu opens Akeru's. Both stop the simulation. When Akeru's menu
closes, the game counts the rider back in instead of leaving a second menu to
close; a pause the player asked for stays theirs. A controller that disconnects
mid-run opens the game's pause menu. Pause, backgrounding and disconnect clear
held input.

The game draws its own touch controls (a thumb stick, HOP, TUCK and BRAKE, and
a pause button), so it asks the host to keep its touch overlay hidden. In the
direct player its distance readout and pause button move aside for the shell's
menu button. Its own keyboard controls remain: arrows or A/D, Space, Down or S,
Up or W, Esc or P, and M for sound.

Landings, stumbles and lost boards are sent as bounded `rumble` requests. The
shell decides whether anything vibrates; it is off until the player enables it.

## Progress and the pill

Best distances, each day's best run (replayed as a ghost) and sound settings
use the host's title-scoped guest save slot, with compare-and-swap revisions.
A run in progress is not saved; this is not a snapshot or cloud sync. A stored
save the game cannot read back exactly (damaged, or written by a newer build),
a revision conflict or a failed write stops further writes for the session,
shows a saving-unavailable message and leaves the existing bytes alone.

The pill's sound action mutes and unmutes the game; `save` and `save-status`
confirm stored progress and report no manual snapshot; `restore` is refused,
honestly; `restart` restarts a run in progress and leaves progress untouched.

## Validation

```sh
npm run check
npx playwright test tests/browser/slipface.spec.mjs
```

Unit tests cover the controller mapping, malformed and foreign input, save
decoding, conflicts and blocked writes, pill actions, and the recipe's
refusals (other revision, dirty checkout, unsupported remote, imports that
leave the title, device modules and APIs) against small fixture repositories.
They run without the game source.

The browser tests need the build and skip without it; a skip is not gameplay
validation. They run the real title in the catalog demo with a simulated
standard controller, touch events and the keyboard, and check both pause
menus, forged and replayed messages, disconnect, rumble, pill actions through
the native-menu entry point, progress across a reload, a save conflict between
two sessions, and that the title frame never calls the Gamepad API, IndexedDB,
web storage or `fetch`. The first test also writes the ignored
`dist/previews/slipface.png` cover from the game's title screen.

Physical Backbone and Bluetooth controllers, phone browsers, the Backbone
app's native pill and WebView, notched-screen safe areas inside the frame and
audio start on a phone have not been checked and need devices.

## Rights

The game is original work: its code, pixel art, lettering, sound effects and
music were written for it, and it bundles no third-party code or assets. Its
source declares no license, so the manifest records the source license and
rights as `unknown`, and the catalog entry carries `publicationBlocked`. This
package does not assert a completed rights or trademark review, and the local
build cannot enter the public preview packager.
