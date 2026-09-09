# Browser input provider

`@akeru/input` is the reusable web input implementation for the Akeru v0.1
contract. It normalizes standard Gamepad API devices and mandatory Pointer Events
touch controls into immutable `InputSnapshot` objects. Keyboard input is reserved
for shell navigation and never enters a title's gameplay channel.

## Catalog and runtime integration

The source browser entry is `packages/input/src/browser.js`; hosting maps it to
`/input/browser.js` and serves its sibling modules under `/input/`. The optional
stylesheet is `/input/styles.css`.

For catalog-only navigation, create a provider with the fixed safe `catalog`
scope. No touch mount is needed:

```js
import { createBrowserInputProvider } from '/input/browser.js';

const input = createBrowserInputProvider({ titleId: 'catalog' });
const unsubscribe = input.subscribeNavigation(event => navigateCatalog(event));
input.start();
```

Navigation events are frozen values with one of these exact shapes:

```js
{ type: 'move', direction: 'up' | 'down' | 'left' | 'right' }
{ type: 'activate' | 'back' | 'menu' }
```

Arrow keys move, Enter/Space activates, Escape goes back and M opens the menu.
Editable controls and modifier chords are ignored. In catalog mode, a standard
gamepad maps its d-pad/left stick and south/east/start buttons to the same events.
Directional gamepad input fires on the rising edge, waits 350 ms, then repeats at
most every 120 ms. Action buttons do not repeat.

For gameplay, use the validated title id so preferences remain title-scoped, and
mount the mandatory touch surface:

```js
const input = createBrowserInputProvider({ titleId });
const unmount = input.mount({
  touchRoot: document.querySelector('#touch-controls'),
  controlsRoot: document.querySelector('#control-settings'),
});
const unsubscribe = input.subscribe(snapshot => channel.sendInput(snapshot));
input.start();
```

`touchRoot` is required for every gameplay mount. `controlsRoot` is optional and
receives the text-only controller/deadzone/remapping overlay. Call `showControls`
and `hideControls` from trusted shell UI. Once gameplay is mounted, controller
activity produces gameplay snapshots only, so it cannot also move the catalog.
Call `unsubscribe`, `unmount` and `dispose` when the route or title session ends;
all are safe to repeat.

## Normalization and recovery

Only connected Gamepad API devices whose `mapping` is `standard` enter the
controller path. Standard buttons and the first four axes receive stable physical
names, then the current title mapping converts them to logical actions. The
default actions cover confirm, cancel, menu, directions, movement and look axes.
Programmatic mappings may use any bounded contract-safe logical action such as
`fire` or `steer`; the generic overlay intentionally offers only the supported
baseline actions. A title-specific controls screen may call `setMapping` for
additional reviewed actions.

Axis values at or below the configured axial deadzone become zero and the rest
are rescaled to [-1,1]. The deadzone, controller slot and mappings persist under
`akeru:input:v1:<titleId>`. The record contains no controller name, hardware id,
account id or credentials. Invalid/corrupt records fall back to defaults. Storage
denial leaves input usable without persistence.

Automatic controller selection retains the active pad while it has input and can
switch to another standard pad that becomes active. Explicit selection uses a
Gamepad API index from 0–15. A selected controller that disconnects emits a neutral
disconnected snapshot. Reconnect, focus restore and visibility restore require a
neutral physical sample before held input can be delivered again. The configured
axis deadzone is also the reconnect-neutral threshold, preventing normal stick
drift from blocking recovery.

Touch uses pointer capture and tracks pointer ids independently for simultaneous
direction/action presses. Pointer up, cancellation, lost capture, window blur and
background visibility clear held input. An idle connected controller never steals
the active provider from touch. Every provider change emits an empty neutral
snapshot first so titles cannot retain a held action.

The generic touch surface is digital. A title adapter must translate its logical
direction actions into gameplay movement and prove that its full game remains
playable. Titles that need analog aim or gestures, including FPS controls, require
a title-specific reviewed touch provider or an extension of this provider; this
package does not make those titles touch-ready by itself.

When `localStorage` or `navigator.getGamepads()` is absent or throws, `getState()`
reports `gamepad: 'unavailable'` after polling and touch plus keyboard navigation
continue to work. This package implements no native bridge and does not patch
browser APIs. A future native input-only provider must emit the same bounded
contract without exposing general native authority.

## Verification

`tests/input-normalize.test.mjs` covers mapping, standard indices, deadzones and
preference isolation. `tests/input-provider.test.mjs` supplies deterministic fake
browser APIs for touch cancellation/focus, idle-pad isolation, multiple-pad
selection, reconnect gating, shell navigation repeat limits and denied browser
APIs. The original `examples/input-demo` is for browser and physical-device checks;
it is not a title or proof of a hardware pass.

The demo was reviewed in Chromium 152 on 2026-09-09 at a synthetic 390x844 mobile
viewport: it had no horizontal overflow; pointer hold/release remained stable with
an idle simulated standard pad; a confirm remap persisted across reload; and mocked
denial of storage plus Gamepad API enumeration preserved touch with no page errors.
This is browser and synthetic-provider evidence, not a physical controller or touch
device pass.

See [the manual device checklist](manual-device-checklist.md) for acceptance that
cannot be claimed by the automated harness.
