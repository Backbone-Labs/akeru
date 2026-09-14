# Anarch local playable

Base edition, no mods, pinned to `6f90562161200682459e772f1dacb747f23c5f95`.
This is a local evaluation package, not a publication approval. Production catalog
and deployment packaging do not include it. Upstream source and generated binaries
are never committed. Only the selected, individually audited CC0 headers and license
are copied into ignored build directories after verifying their SHA-256 evidence.
See `compliance/rights-audits/anarch.json` for preserved authorship/waiver evidence.

Use the repository-pinned Node/npm. Install Emscripten **4.0.15** with emsdk tag
`4.0.15` (emsdk revision `389a68bc35dcff7ebae4614e1615099dafda00d1`, compiler release
`b412b6307e541b93dd93f01b61181e15c17302ec`). Clone upstream into a directory outside
this repository and check out the revision above. Then:

```sh
source /path/to/emsdk/emsdk_env.sh
ANARCH_SOURCE=/path/to/anarch npm run build:game -w @akeru/anarch
npm run preview -w @akeru/anarch
```

Open the printed loopback URL. The catalog and title have separate loopback origins;
the title uses the existing nonce/sequence-bound runtime and host-owned saves channel.
Only the local title response permits WebAssembly and same-origin engine fetching.
No accounts or production activation are involved. Browser WebAssembly and Canvas 2D
are required. Toolchain/runtime redistribution notices and publication approval remain
pending; the manifest deliberately does not claim cleared rights.

Controls: arrows or left stick move/turn; Confirm/A fires and selects; Cancel/B
with arrows strafes or looks; Menu plus Down opens the in-game menu. The same host
controls support touch. Enable sound inside the game for the original bytebeat music
and sound effects; browsers require a user gesture to enable audio. The initial mixer
plays one sound effect at a time. The browser must stay foreground for playback.

The engine's 12-byte save stores unlocked levels, level-start inventory and totals,
not a mid-level position. Saves are guest-local, revision checked, and read before
initialization. Invalid/unavailable saves block replacement while allowing play.
Pausing clears input and stops simulation time. No game-owned localStorage or native
transport is used. Hardware controller feel and real mobile touch remain device QA.

`dist/anarch/build-record.json` records source and generated engine digests. Repeating
the build on the same pinned toolchain should reproduce those engine digests. Standard
`npm run check` does not fetch or compile third-party games; building the game is an
explicit, separate command. Audio scheduling may have up to 250 ms buffered on pause.
