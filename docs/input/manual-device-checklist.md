# Manual controller and touch device checklist

Record the exact browser/WebView version, operating system, device/controller,
tester, date and evidence link for each run. A blank row is pending; this document
does not claim a physical device pass.

| Surface | Required evidence | Status |
| --- | --- | --- |
| Desktop Chromium | Standard controller mapping, two-controller selection, disconnect/reconnect neutral gate, remap persistence, keyboard catalog navigation | Pending |
| Desktop Safari | Standard controller mapping, focus recovery, overlay and storage fallback | Pending |
| iOS Safari | Simultaneous touch direction/action, pointer cancellation, rotation/background recovery, safe-area layout | Pending |
| iOS WKWebView | Same touch cases plus native overlay interruption and app resume | Pending |
| Android Chrome | Simultaneous touch, connected controller switching, background/resume and remap persistence | Pending |
| Android WebView | Same cases plus native overlay interruption and app resume | Pending |
| Accessibility | Touch control names, focus order, controls overlay labels, zoom and screen-reader smoke test | Pending |

For each controller surface:

1. Start with sticks/buttons neutral and verify no input before user action.
2. Hold each mapped button and sweep each mapped axis through its range; verify
   normalized values and the configured deadzone.
3. Connect two standard controllers. Activate the second while the first is idle,
   then explicitly choose each slot in the controls overlay.
4. Hold an action while disconnecting, reconnect while still held, and verify the
   action remains released until the device returns to neutral and is pressed again.
5. Hold an action while opening a shell/native overlay, switching applications,
   backgrounding and restoring focus. Verify one neutral release and no stuck input.
6. Remap supported actions, reload the same title, and verify persistence. Open a
   different title and verify the mapping did not cross title scope.

For each touch surface:

1. Hold a direction with one pointer and press/release confirm with another.
2. Drag off a captured control, trigger pointer cancellation and rotate/background
   during a held press. Verify every path releases the action.
3. Keep touch held while an idle controller is connected; verify the controller
   does not switch providers or clear touch.
4. Verify every gameplay screen retains usable touch controls at supported viewport
   sizes and safe areas. Title-specific playability remains a per-title QA gate.
5. For games needing analog aim or gestures, verify the title-specific touch axes
   or control layer. The generic digital surface is not evidence of FPS playability.

Catalog navigation must be checked separately with keyboard and controller. Hold a
direction to verify bounded repeat; confirm that activate/back/menu fire only once
per press and that gameplay mounting does not double-dispatch shell navigation.
