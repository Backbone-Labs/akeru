# Standstill and Mythic Kitchen Instant Games acceptance

The app uses the same `launchhtml5game` deep-link action and HTTPS `/play/<id>`
player routes as Doom. Keep these destinations stable:

- `https://backbone-akeru.vercel.app/play/standstill`
- `https://backbone-akeru.vercel.app/play/mythic-kitchen`

Generate a phone test link as `backbone://launchhtml5game?url=` plus the
percent-encoded destination above. The existing Doom-enabled Backbone build
recognizes the production host and both paths, installs its native pill and
forwards input, pause/resume, sound, save-status and exit. No fake variant ID is
needed for testing. Retool's HTML5 game URL is the HTTPS destination, not the
`backbone://` test wrapper. Do not hand off Kitchen for phone acceptance before
its public multiplayer endpoint is deployed and verified. Retool publication is
separate and follows the user's phone acceptance.

## What the current adapters save

Both games keep earned progress and preferences in host-owned title-isolated
storage. They do not currently serialize a running simulation. The pill explains
this, reports no manual snapshot, and rejects restore rather than claiming to
resume the middle of a round. Restart resets a solo level and preserves earned
progress; it cannot reset a shared online room. These are device-local saves,
not account sync. Abrupt app termination can lose the latest unsaved change.

## Phone acceptance with the same Backbone build used for Doom

1. Tap the app test link on iPhone; confirm the game opens inside Backbone and
   uses its native pill, with no duplicate web menu.
2. Standstill: sticks move/look, RT fires, X grabs, LT/Y throws, A jumps, B opens
   the game's pause menu. Verify tutorial and live gameplay hints. Confirm mouse
   capture still works when returning to a desktop browser.
3. Kitchen: stick moves, A picks up/puts down, X/RT works, B dashes, Y switches
   chefs in solo. Create a public room and join from a second phone/computer.
   Ready both players and start; confirm each sees the other move and interact.
4. Open the pill while moving. Solo gameplay freezes; online Kitchen continues
   for the other player while your chef stops. Resume without stuck inputs.
5. Mute/unmute and background/resume. If the browser blocks audio activation,
   tap inside the game once. Confirm sound is audible on the phone.
6. Earn progress, save, exit through the pill, reopen, and restart Backbone.
   Confirm progress persists, with no claim of mid-round restoration.
7. Disconnect/reconnect the controller and try native touch controls. Check
   landscape safe areas and that Exit returns to Backbone.

Automated native-bridge tests simulate the app boundary and do not replace this
physical-device acceptance. The creator source and asset rights remain
unspecified; deployment authorization is not a fabricated open-source license.
