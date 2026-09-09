# Remaining candidate source-rights groups

The source-declaration audit now covers **all 11 candidate records** through
**nine distinct pinned trees**, sharing Freedoom's tree across its three titles.
Together with [Anarch/Freedoom](source-rights-audit.md), it classifies **11,061
tracked paths in 119 disjoint groups** backed by **289 inspected text records**.
Each text record has a source permalink, Git object, byte count and SHA-256;
actual fetched bytes were checked against both hashes. No binaries or asset
copies are published, and no game build or production action was performed.

The [audit index](../../compliance/rights-audits/index.json) joins every candidate
to its source pin. Coverage means every tracked path has a scoped declaration or
explicit unknown. It does not mean each author, imported asset, dependency or
license has been cleared. All approval statuses remain pending. The existing
source-inventory hashes remain unchanged.

| Candidate | Source groups and concrete notice findings | Outstanding source evidence |
| --- | --- | --- |
| [Open Golf](../../compliance/rights-audits/open-golf.json), 1,065 paths / 29 groups | MIT project; separate cimgui/ImGui MIT and GLFW Zlib notices; direct MIT xatlas/parson/fast_obj/miniz source, Zlib Sokol headers, MIT-or-Unlicense stb/Mattias Gustavsson headers, and lightmapper's public-domain/fallback declaration. Kenney Nature Kit 2.1 has its own CC0 notice. `coi-serviceworker.min.js` identifies v0.1.6, Guido Zuidhof and MIT. Preserve component authors and license texts, including xatlas's multiple notices and embedded subcomponent notices in dual-licensed headers. | Castle-Rock, FiraSans, FontAwesome bytes and generated font atlases lack matched notices. Generated IconFontCppHeaders metadata has moving source URLs. `miniz.h` refers to an end-of-file unlicense statement absent from that file, whereas `miniz.c` carries MIT. Remaining vendor wrappers, prebuilt Sokol tools, native Gradle wrapper/resources and other generated assets need their own source correspondence. |
| [IsoCity](../../compliance/rights-audits/isocity.json), 8 paths / 4 groups | MIT project. `js/main.js` identifies the OpenGameArt Isometric Landscape texture and separately attributes a helper to Stack Overflow answer 36046727. These two sources are recorded rather than silently absorbed into MIT. | Exact texture-to-original matching and the borrowed helper's applicable grant/attribution remain unresolved. Favicons/screenshots inherit the project claim without independent image provenance. |
| [Server Survival](../../compliance/rights-audits/server-survival.json), 162 paths / 4 groups | MIT project. Pinned `package.json` and `package-lock.json` identify development dependencies. `index.html` separately identifies Tailwind's CDN and Three.js r128; these runtime dependencies are outside that lockfile. Finder metadata is excluded. | Five audio files have no asset-specific credits. Exact CDN payload/license pins and selected dependency notices remain absent. The gameplay GIF has only inherited project provenance. |
| [Whatajong](../../compliance/rights-audits/whatajong.json), 256 paths / 10 groups | MIT project. Font, music, voiced sounds, backgrounds, sprites, textures, tiles, legacy app audio and remaining artwork are separate groups. Manifest/lockfile hashes and declared dependency ranges are recorded, including Nunito, Howler, Solid and PostHog. | BraveGates has no bundled license; Nunito's npm dependency cannot cover it. No per-file creator/license/credit record establishes the asset groups. Exact selected/transitive package notices remain separate from application MIT, including font-package notices. |
| [Hextris](../../compliance/rights-audits/hextris.json), 74 paths / 13 groups | GPL-3.0-or-later project. Hammer 1.1.2 and JavaScript Cookie have direct MIT declarations; Keypress 1.0.8 declares Apache-2.0. FontAwesome 4.1.0 CSS declares MIT and separately identifies the fonts as OFL-1.1. Preserve each license and applicable notices rather than labeling vendor code GPL. | jQuery 1.9.1 retains a license URL but not full terms. JSONfn, rrssb and SweetAlert payloads have no usable retained license/version notice. Exo2, Lovelo, Quattrocento Sans and Roboto need matched family-specific grants. Store/social artwork needs its own provenance and branding review. |
| [2048](../../compliance/rights-audits/2048.json), 34 paths / 4 groups | MIT project. Polyfills, images and Clear Sans are separate groups. All three polyfills were inspected; none contains an independent origin/license header, so their claim remains inherited. | Clear Sans CSS names faces but supplies no font license. Match the EOT/SVG/WOFF files to an exact source release and notice. No independent icon/launch-image provenance is established. |
| [Hypersomnia](../../compliance/rights-audits/hypersomnia.json), 5,365 paths / 33 groups | AGPL-v3 project claim is separated from explicit CC0 content claim, vendor notices and 11 gitlink objects. Box2D source headers declare Zlib; date/alphanum declare MIT; stb offers MIT/Unlicense; LZ4 declares BSD-2-Clause. GLFW, cpp-httplib, FreeType and extra-cmake-modules have their own scoped notices. | Future investigation only. Unexpanded submodules, BLAKE3's missing bundled grant, stripped clipboard/GLAD/vendor wrapper notices, documentation theme boundaries, selected build dependencies and the content exceptions below remain unresolved. |

## Hypersomnia content and vendored exceptions

The [pinned content README](https://github.com/TeamHypersomnia/Hypersomnia/blob/e4dd2c8f87358cb83cfdef5b352093379907147c/hypersomnia/content/README.md)
explicitly claims CC0 for the content subtree **except social sign-in graphics
and some editor icons**. The audit conservatively separates every matching
`editor_*.png` until the game-icons.net author/license mapping is available. It
also preserves the author's explicit caveat that freesound uploaders may have
mislabeled sound rights. An upstream CC0 assertion is not an independent
verification of those recordings.

[FreeType's license notice](https://github.com/TeamHypersomnia/Hypersomnia/blob/e4dd2c8f87358cb83cfdef5b352093379907147c/src/3rdparty/freetype2/LICENSE.TXT)
offers FTL or GPL version 2 or later. The audit makes no choice. BDF and PCF
READMEs provide separate MIT-style grants; BDF also retains a distinct New Mexico
State University disclaimer. The gzip module has Zlib terms, and HarfBuzz bridge
files have their own old MIT-style notice. Generated reference-site JavaScript
and former BDF hash files remain separate exceptions rather than being treated
as ordinary FreeType code. Retain the specific notices for the compiled set.

The [streflop README](https://github.com/TeamHypersomnia/Hypersomnia/blob/e4dd2c8f87358cb83cfdef5b352093379907147c/src/3rdparty/streflop/README.txt)
and bundled LGPL 2.1 text establish a separate LGPL source chain, including
imported GNU libm. The README references `Random.cpp`, but that file is absent
from this pinned tree; the audit does not claim to have verified its notice.
Per-file Sun/glibc notices and final linkage obligations remain unresolved.
The source index preserves all 11 submodule commits; it does not dereference or
license their contents by applying Hypersomnia's root AGPL.

## Completion boundary and checks

This closes the **grouped source-inventory and notice-exception baseline** for
every candidate. Concrete missing grants and correspondence checks are listed
per group; no source fetch failed in this review. Further source work is needed
for selected third-party dependencies, nested submodules and unmatched
assets/fonts. Human licensing decisions remain with the owner. Build recipes,
artifact/lump lineage and complete release notice bundles can be finalized only
against selected downstream packages. Controller, touch, saves, WebView QA and
content/publication approvals remain distinct work.

`npm run check` verifies every candidate is covered at its exact source pin,
that all groups are disjoint and complete, and that direct declarations cannot
be replaced by a root license. Negative tests also reject claiming parent AGPL
for an unexpanded gitlink and substituting GPL for the CSS's scoped OFL font
claim. Optional byte verification works for any audit name:

```sh
node scripts/validate-rights-audit.mjs open-golf /path/to/pinned/Open-Golf
node scripts/validate-rights-audit.mjs hypersomnia /path/to/pinned/Hypersomnia
```

Validation checks structure and known hashes; it does not authenticate a legal
reviewer or turn a recorded declaration into publication permission.
