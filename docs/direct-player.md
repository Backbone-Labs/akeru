# Direct game player

`/play/<catalog-title-id>` opens a known catalog game immediately, without the
website landing page, onboarding, catalog navigation or detail page. `/g/<id>`
continues to serve the website detail view. An app tile can use the direct URL
once its deployment and catalog entry are approved.

The player uses the existing availability check, isolated title frame, runtime
channel, input provider and host-owned per-title saves. Unknown or unavailable
titles never create a game frame. Runtime errors offer retry inside the player.
No arbitrary game URL can be supplied through this route.

The frame fills the dynamic viewport inside safe-area insets. Games retain their
own aspect ratio and controls. The small Menu button pauses the title and opens
Resume, Controller settings and optional host Touch controls. Host touch buttons
start hidden in this mode to avoid covering titles' own touch interfaces; enable
them from Menu when needed. Native app chrome remains responsible for closing
its WebView. This change does not add native navigation or storage permissions.

The local playable server supports this route. The public-preview packager emits
`player.html` and a `/play/:id` rewrite, with the player body class present before
JavaScript runs. Packaging alone does not publish or activate a title.

## Verification and remaining device work

Browser tests cover portrait, landscape, rotation, simulated safe-area insets,
automatic launch, pause/resume and unavailable IDs. Browser viewport emulation
does not establish actual WKWebView or Android WebView compatibility.

Before connecting production app tiles, verify physical-device controller input,
audio activation, background/foreground behavior, native close and return,
performance and save persistence. The current storage provider remains browser
storage; this work does not establish native-backed saves, export support, cloud
sync or persistence through WebView eviction. Real-device evidence is required
before declaring those behaviors complete.

## Expandable menu and rumble

The player pill expands into a scrollable settings panel. Rumble is opt-in per
session, with a hardware test and graceful unsupported-device feedback. The
shell accepts authenticated `akeru.catalog.v1` `rumble` messages only while a
game is playable and a host handler is installed. Payloads contain exactly
`duration` (1–500 ms), `strongMagnitude` and `weakMagnitude` (0–1). The provider
limits effects to ten starts per second and stops effects on pause, hiding,
disable and disposal. A game cannot choose the controller or enable rumble.
Racer sends this optional message on car/roadside collisions; other titles need
their own meaningful event integration. Physical hardware support is unverified.

Saved progress in the panel reads only the current title's host-owned storage.
It does not promise snapshots or replace a game's save/checkpoint controls.
Exact-moment save/load commands require a future per-title engine integration.
Export is intentionally absent here until native download support is available.
Leaving asks for confirmation, disposes the game session and shows a closed
screen. It does not pretend to dismiss a native WebView: the app's existing
back/close control remains the return path until a native host callback exists.
