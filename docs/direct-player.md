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
