# Red Eclipse browser preview

This title adapter creates or joins an invite-only Red Eclipse room through a fixed WebSocket-to-ENet relay. Each room has its own native server process; bots and public master-server registration are disabled. It uses the catalog host's controller/touch input and audio actions; it does not create another Backbone menu. Guests receive a temporary player name. A live multiplayer match cannot be restored as a local save state or paused for other players, so those actions are not advertised.

The browser engine is a modified build of Red Eclipse revision `faf378d12558addc700d0e464e7e8c3a39fbceee` with Emscripten 4.0.15 and a WAV-only libsndfile 1.2.2 decoder. The reviewed release includes Fortitude, gameplay models and sounds, source notices, and source/relink archives. Restricted music and ambiguous textures are excluded or replaced. Generated engine binaries and third-party assets belong in ignored release output, never in this source package.

## Controls

| Action | Controller / on-screen pad |
| --- | --- |
| Move / aim | Left / right stick |
| Fire / alternate fire | RT / LT |
| Jump / crouch | A / B |
| Reload / use | X / Y |
| Special / walk | RB / LB |

Desktop play uses the engine's keyboard and mouse controls. Pointer lock is requested only by a mouse click. Selecting another input provider or opening the host menu releases held input. Sound is resumed on a direct game gesture when the browser requires one.

## Release process

Use `scripts/package-red-eclipse-preview.mjs` with reviewed engine and asset inputs. The packaging script verifies the live shell baseline before appending this title, preserves existing entries, and limits the title's network destinations to the configured secure relay and its HTTPS room API. Source/asset review and explicit deployment authorization remain separate from manifest validation.

The server source and isolated build instructions live in `server/`. Local builds and tests never deploy it. Deploy the title to its own immutable origin, add that exact origin to the relay allowlist, then package the catalog against that origin. Verify two real game clients before publishing the updated shell.

A Cloud Run WebSocket connection has a bounded lifetime; reconnecting starts a fresh guest connection. Match state is held by the dedicated server, not a cloud-save account. The single-instance preview is intended for small playtests, not production matchmaking or high availability.

## Startup budget

The mobile asset recipe in `tools/optimize-assets.py` caps world/model textures at 512 pixels and resamples high-rate PCM sounds to 22.05 kHz with channels preserved. It leaves interface/font atlases untouched, never edits the source asset set, and records every changed hash and modification in the derived rights inventory. Use the pinned Python tool versions documented in the recipe.

Compile the WebAssembly module while the data package downloads. Immutable release URLs receive long-lived browser caching; catalog and shell documents remain refreshable. The engine loads Fortitude only through the server welcome, avoiding duplicate world setup. To replace a published title, packaging requires `--replace-digest` to match the exact reviewed current Red Eclipse digest, plus a verified live shell baseline.

## Private rooms

Create a room, then use **Invite friends** to copy the Akeru invitation link or share its 20-character code. Friends explicitly join that room; another Create action starts a separate match. The catalog forwards only a validated room code to this title. Relay credentials remain inside the title frame and are not placed in invitation URLs or persistent storage.

The preview supports four concurrent rooms with eight players each. Anyone possessing an invite can join, so treat the link as private; there is no public room directory or account identity check. Only the creator's current session can close a room for everyone. Empty rooms expire after ten minutes, and deployment or instance restart ends all rooms. This is temporary match state, not persistent game saves.
