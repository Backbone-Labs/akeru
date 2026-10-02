# Browser engine changes

`browser.patch` modifies Red Eclipse upstream revision
`faf378d12558addc700d0e464e7e8c3a39fbceee`. These changes are an independent browser
adaptation, not an upstream release. The original engine's zlib license applies
to the modified engine code; retain its copyright/license notice.

Apply from a checkout of that exact revision with `patch -p1 < browser.patch`.
The release's source downloads include complete modified sources, the pinned
Emscripten build/link recipes, library sources, and relinkable objects. The
compiled engine, reviewed data bundle, and toolchain are not stored in Git.

The patch adapts SDL/OpenGL startup and shaders to WebGL2, uses the browser's
frame scheduling, exposes bounded input/audio/lifecycle functions, and connects
to a fixed loopback ENet address carried by a separately configured WebSocket
relay. The JavaScript adapter never accepts arbitrary game script or arbitrary
network destination commands from the host.

The browser profile preloads the arena before connecting, avoids desktop-only
rendering paths and runtime navigation expansion, and keeps network progress
independent of local menu input. Build the native dedicated server with the
separate server recipe; do not apply the browser patch to that build.
