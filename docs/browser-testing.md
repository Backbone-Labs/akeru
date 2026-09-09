# Browser testing

The browser suite exercises the catalog shell, the original isolated title fixture, and the packaged empty production catalog in Chromium. It covers browse, detail and launch; touch hold and release while an idle controller is connected; controller Start pause and resume; per-title remap persistence; focus-loss release and neutral recovery; forged channel-source rejection; mobile overflow; and safe empty, paused, unpublished and unknown routes.

Install the repository's exact development dependency, `@playwright/test@1.63.0`, and install its Chromium build once:

```sh
npx playwright install chromium
```

Package the production catalog before running the suite. The repository command is:

```sh
node scripts/package-catalog.mjs
npx playwright test
```

`AKERU_CATALOG_DIST` may point to another packaged catalog directory. The test copies that release into a temporary directory, validates and serves it with `startCatalogServer`, then closes the server and removes the copy. The original demo uses `startCatalogDemo` and also closes both loopback servers after its worker finishes.

CI uses the Chromium revision installed by Playwright. For a local Chromium or Chrome binary, set an absolute executable path:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium npx playwright test
```

Screenshots and traces are retained only for failed tests under `test-results/browser`; videos are disabled. Retries are disabled, and every test fails on an uncaught page error or `console.error`.

The gamepad in these tests is a browser API shim and focus recovery uses synthetic window focus events. Pointer events are sent through the rendered touch controls in Chromium. These checks do not claim passes on physical controllers, touchscreens, mobile browsers, assistive technology, or native input transports.

The remaining manual device gates are intentionally unchecked:

- [ ] On each supported desktop browser, record the OS and physical controller, then verify connect, multiple-controller selection, Start pause and resume, remap persistence, disconnect release, reconnect neutral gating, and recovery after switching away from the window.
- [ ] On each supported phone and tablet browser, record the device and OS, then verify touch hold, multi-touch, pointer cancellation, background release, orientation changes, safe-area layout, and the absence of horizontal overflow.
- [ ] With the supported keyboard and assistive-technology matrix, verify visible focus, browse/detail navigation, dialogs, controls selection, pause/resume, and exit without focus traps.
- [ ] Record any native input transport separately; the browser API simulation in this suite is not evidence for a native transport.
