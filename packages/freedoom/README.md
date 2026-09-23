# Freedoom local source ports

This package runs the original Freedoom Phase 1 and Phase 2 campaigns and FreeDM maps in a locally compiled libretro-PrBoom WebAssembly engine. It adds an Akeru-owned browser frontend, normalized controller/touch input, keyboard/mouse controls, gesture-unlocked audio, and guest saves through the host save service. No engine, WAD, artwork, or other third-party source is checked in.

FreeDM is **solo map practice**. The selected engine has no supported bot implementation, so this build has no opponents or multiplayer. The Next map button visits all 32 arenas. This is not a completed bot deathmatch port.

## Build and run

Use the root's pinned Node/npm versions. Install Emscripten **4.0.15**, Python with **Pillow 11.3.0**, GNU Make, and **DeuTex 5.2.3** with PNG support. DeuTex can be compiled from `Doom-Utils/deutex` at `870ca04ec16f39b474a7bebe900faf53d36a8d6d` using its bootstrap/configure/make workflow. Activate the Emscripten environment and Python environment before running the build.

Clone the original public repositories, then set paths to those checkouts:

```sh
git clone https://github.com/libretro/libretro-prboom.git /tmp/prboom
git clone https://github.com/freedoom/freedoom.git /tmp/freedoom
PRBOOM_SOURCE=/tmp/prboom FREEDOOM_SOURCE=/tmp/freedoom DEUTEX=deutex node packages/freedoom/build.mjs
node packages/freedoom/preview.mjs freedoom1
```

The build reads the exact revisions in `sources.mjs` with `git archive`, verifies the full archive SHA-256 values, extracts fresh sources to ignored `dist/freedoom-source`, compiles PrBoom with threads and FluidSynth disabled, and builds all three WADs from source with a fixed version string. It does not download or reuse compiled cores or game payloads. Output directories are `dist/freedoom1`, `dist/freedoom2` and `dist/freedm`. The factory is `freedoomOptions(id)` in `catalog.mjs`; it verifies artifact hashes and edition identity before the local catalog accepts a title. Pass `freedoom2` or `freedm` to the preview command for the other editions.

Use WASD to move/strafe, arrows or mouse to turn, click/Enter to fire, E/Space to use, Q/R to change weapon, and M for the game menu. A controller uses left stick for movement, right stick for turn, A/trigger to fire, B to use, and Y for next weapon. Touch uses host arrows and A/B. Pointer lock is optional and host fullscreen/lifecycle remain host-owned.

Guest progress is saved every 15 seconds, when paused, or with Save. Save slots are scoped by host title identity; the engine only sees an in-memory filesystem. The frontend refuses invalid/incompatible saves and preserves the previous record after conflicts or read failures. Browser saves are tied to the exact engine build and may not survive future upstream changes. The direct player hides the game toolbar: use the host pill to save or restore a separate manual `snapshot` slot. Restoring requires confirmation; automatic `progress` saves never overwrite that snapshot. Audio starts automatically when permitted, otherwise a tap inside the game unlocks it. Fire-button feedback uses bounded host rumble, with phone impacts available in the updated Akeru iOS bridge. This is input feedback, not engine damage/weapon telemetry.

Engine menus can also save to temporary memory, but only the host Save action persists across sessions.

## Verification and rights boundaries

Run `npm run check`, `npm run lint`, and the source-built runtime tests:

```sh
npx playwright test tests/browser/freedoom-playable.spec.mjs
```

Runtime tests verify original framebuffer rendering, keyboard/controller input, all three editions, FreeDM map switching, host pause/resume and save restoration. They also capture actual frames into ignored `dist/previews`. Unit tests cover invalid input, full release, edition rejection and local isolation.

PrBoom declares GPL-2.0 and Freedoom declares BSD-3-Clause. The output includes their license texts and Freedoom contributor/level/music credits. Build records retain pinned sources, complete-source archive hashes, output hashes and **pending/unknown** rights status. The existing `compliance/rights-audits/prboom-candidate.json` and `freedoom-credit-map.json` remain relevant: the engine's embedded resource WAD, individual compiled dependency notices and individual asset provenance still require review before distribution. A local compile is not publication approval. Keep the complete extracted source and toolchain available locally; no corresponding-source completeness or third-party asset approval is fabricated here.

The package never activates a title, changes production systems, hosts publicly, enables accounts, exposes credentials, or enables remote multiplayer.
