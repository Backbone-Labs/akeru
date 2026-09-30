# Standstill

Single-player creator game integrated through Akeru's isolated title protocol.
The build pins source revision `1ed389c4697df34ae5ee465cec2c338de3306541` and
reads an explicitly supplied local checkout. Private source and the character
model are emitted only into ignored build artifacts.

```sh
node packages/standstill/build.mjs /path/to/authorized-standstill-checkout
node packages/creator-preview/preview.mjs
```

Open the printed `/games` URL or `/play/standstill`. No separate game server is
needed. This does not publish the game or change existing production URLs.

## Controls

Left stick or D-pad moves; right stick aims. RT fires/punches, A jumps, X
grabs/catches, LT or Y throws. Stick aim uses elapsed time and the game's own
sensitivity/invert settings. B opens the game's pause menu; Menu opens Akeru's
menu. Both pause simulation. Stick/D-pad navigates menus, A selects, B returns.

Two controller chapters are inserted into the actual game's Tutorial, before
its seven original pages, using its own visual style. A/RB advances, LB goes
back and B closes. The tutorial is also available from the in-game pause menu.

Touch uses Akeru's twin sticks and action buttons with tappable native menus.
WASD/arrows, Space, E and F retain the original keyboard actions. Mouse aiming
uses drag in the isolated player; left click fires and right click throws.
The integration does not require pointer lock.

## Progress and validation

Unlocked levels, scores, tutorial-seen status and settings use the host's
title-scoped guest save slot. Levels restart; this is not an exact mid-fight
snapshot or cloud sync. Pause, focus loss and controller disconnect clear input.

```sh
npm run check
npx playwright test tests/browser/standstill.spec.mjs
```

Source-dependent browser checks skip when no private build is present. Browser
controller checks use a simulated standard gamepad; physical Backbone/Bluetooth
and mobile WebView acceptance must still be checked on devices.

No source license file was present in the evaluated checkout. Source and asset
rights remain unknown, and the catalog marks publication blocked pending review.
See [the creator integration guide](../creator-preview/README.md).
