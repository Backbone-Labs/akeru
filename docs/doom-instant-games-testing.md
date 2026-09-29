# Freedoom Instant Games acceptance

Test URL: `https://backbone-akeru.vercel.app/play/freedoom1`.
Use the direct `/play/` route in Retool, not `/g/` or `/games`. Retool is not modified by this work.

## What is implemented

- Freedoom Phase 1 in the source-built PrBoom engine; the original aspect ratio is preserved.
- Audio attempts to start when allowed. If the browser blocks Web Audio, tap the orange sound prompt inside the game once. Controller messages alone are not user activation.
- The direct player hides the title's bottom toolbar. The Backbone pill offers controls, touch controls, sound/vibration, saves and exit.
- Local auto-resume progress saves every 15 seconds, on pause, and best-effort on backgrounding. Abrupt app termination can lose the most recent unsaved seconds.
- A separate manual snapshot supports save/confirmed restore without being overwritten by automatic saves. The host owns IndexedDB storage, isolated by title. No account/cloud sync is claimed. Clearing app website data removes saves; saves from Safari do not automatically transfer to the app.
- Vibration is opt-in per session. Supported browser controllers use the Gamepad actuator. The updated iOS `akeruPlayer` bridge uses short phone impacts. This is fire-button feedback, not engine weapon/damage telemetry.
- Updated iOS builds handle Leave through the existing browser exit flow. Older builds show the web close screen and require the native back control.

## Required device pass before marking ready

1. Build the `codex/akeru-doom-haptics` iOS branch and launch the URL inside Instant Games on an iPhone with Backbone connected.
2. Start a level; confirm music/sound effects are audible, including after background/foreground and reopening the pill. Check mute/unmute under Sound.
3. Navigate every pill action with stick/D-pad, A and B; ensure gameplay receives no movement while the menu is open.
4. Enable vibration; test it, then press Fire in game. Disable it and repeat. Phone impacts require the updated app; browser tests cannot prove physical vibration.
5. Save a snapshot, move somewhere else, restore it and verify the original location/health. Resume, close, reopen, then force-quit/relaunch to verify automatic progress persistence.
6. Disconnect/reconnect the controller and check touch controls and controller input. Confirm the native exit returns to the app rather than opening the website catalog.
7. Check portrait/landscape safe areas. Preserve intentional Doom letterboxing; do not stretch the artwork.

Automated browser tests cover audio samples, engine-state snapshot restoration, reload persistence, toolbar removal, controller pill navigation and simulated rumble. These checks are not a completed on-phone acceptance pass or publication/rights approval.
