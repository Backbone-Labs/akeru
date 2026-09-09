# Anarch and shared Freedoom source-rights evidence

This 2026-09-09 engineering audit maps **4,097 tracked paths** to specific notice
or provenance groups: Anarch's 248 paths and Freedoom's shared 3,849-path tree.
It records **94 inspected, Git-object- and SHA-256-verified text sources** and
**211 current level/music credit mappings**. No game was built or run; no upstream
binary or artwork is added here. All approval records remain pending.

The machine records are [Anarch](../../compliance/rights-audits/anarch.json),
[Freedoom](../../compliance/rights-audits/freedm.json), the
[credit/output selection map](../../compliance/rights-audits/freedoom-credit-map.json)
and [engine candidate](../../compliance/rights-audits/prboom-candidate.json).
Each source path belongs to exactly one group. `file-declaration` means the
inspected file itself states terms; `subtree-declaration` and
`inherited-project-claim` identify broader upstream assertions. None means legal
clearance or independently proven authorship. Conflict/unknown groups have no
resolved license. Existing source inventories retain `unreviewed` status.

## Anarch findings

Pin: `6f90562161200682459e772f1dacb747f23c5f95` at
[drummyfish/anarch](https://gitlab.com/drummyfish/anarch/-/tree/6f90562161200682459e772f1dacb747f23c5f95).

- **35 files contain direct CC0 declarations**, including portable engine/core,
  embedded image/level/sound arrays, SDL frontend, HTML shell, converters and
  several mods. The [sound header](https://gitlab.com/drummyfish/anarch/-/blob/6f90562161200682459e772f1dacb747f23c5f95/sounds.h)
  also states that its bytebeat formulas were created from scratch. Preserve
  each author/waiver statement and the upstream CC0 license as provenance.
- [mods/README.txt](https://gitlab.com/drummyfish/anarch/-/blob/6f90562161200682459e772f1dacb747f23c5f95/mods/README.txt)
  separately attributes all mods to drummyfish under CC0. That covers the
  declaration for the remaining 67 mod paths, including HD art; their individual
  creation history and the eventual selected modification set remain unverified.
- The remaining **99 base asset paths** inherit the original-art CC0 statement
  in the [README](https://gitlab.com/drummyfish/anarch/-/blob/6f90562161200682459e772f1dacb747f23c5f95/README.md#L30).
  This is stronger than an unidentified repository license, but does not prove
  conversion equivalence between each source image/raw sound and embedded array.
  Eight ancillary files rely on the project claim. Seventeen `bin/` and 22
  `media/` paths stay unknown and excluded from the proposed source-built package.
- The [browser recipe](https://gitlab.com/drummyfish/anarch/-/blob/6f90562161200682459e772f1dacb747f23c5f95/make.sh#L97)
  selects `main_sdl.c`, `HTMLshell.html`, SDL2 and OpenAL through Emscripten.
  External toolchain/library pins and notices are a separate source chain;
  the core's CC0 claim does not cover them. Base edition is the narrowest
  recommended starting point; no edition decision is recorded here.

## Freedoom findings

Shared data pin: `d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85` at
[freedoom/freedoom](https://github.com/freedoom/freedoom/tree/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85).
This development snapshot is the existing inventory baseline, not an approved
stable release. Its three output selections stay distinct.

| File group | Inspected evidence and action |
| --- | --- |
| General data | [COPYING.adoc](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/COPYING.adoc) supplies BSD-3-Clause terms. Preserve copyright, conditions/disclaimer and non-endorsement terms in source and distributed documentation, together with relevant credits. Most assets inherit this project declaration. |
| 33 build/data text files | Their own SPDX headers declare BSD-3-Clause. The JSON binds each declaration to its own blob, rather than treating root COPYING as a file header. |
| PLAYPAL and COLORMAP generators | [playpal](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/lumps/playpal/playpal#L9) and [colormap](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/lumps/colormap/colormap#L2) explicitly declare GPL-2.0-or-later, credit Colin Phipps, Simon Howard and id Software, and have adjacent GPL text. Preserve these terms when distributing generator source. Do not label all source BSD, or infer generated-output licensing solely from the generator license. |
| Tint helper | [graphics/text/tint.py](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/graphics/text/tint.py#L3) declares MIT, attributes Martin Miller/Nick Zatkovich and links a Stack Overflow answer. Full permission/notice provenance remains unresolved; root BSD cannot replace this evidence. |
| Font | [font/README](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/graphics/text/font/README) identifies Brett Harrell's Denex as derived from Deneb. No standalone grant for that chain is supplied there. Keep the attribution and the explicit unknown. |
| 293 GENMIDI instrument files | [GENMIDI README](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/lumps/genmidi/README.adoc#L46) says the instrument set comes from OpenBSD. Exact original revision, applicable notices and per-instrument replacement history are not established; project BSD is inherited evidence only. |
| Desktop utilities and metadata | Three utility scripts declare CC0. Three AppStream XML files have a BSD SPDX header but `metadata_license` CC0 and `project_license` BSD; see [Phase1 metadata](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/dist/io.github.freedoom.Phase1.metainfo.xml#L2). Record the conflicting scope, preserve both statements, and omit these files from the browser package pending resolution. |
| Other visual/audio assets | [CREDITS](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/CREDITS) records contributors by category, not a reliable author-to-every-file join. Sprite, patch, flat, sound and remaining graphic groups retain that limitation, including the Aquatex provenance question. |

The credit map links **100 level files and 111 MIDI files** to current credit
line numbers and intended output lump names in
[buildcfg.txt](https://github.com/freedoom/freedoom/blob/d14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85/buildcfg.txt).
It uses the upstream filename conventions, not name similarity: for example,
`levels/dm01.wad` maps to FreeDM `MAP01`, and `musics/d_dm01.mid` maps to
`D_RUNNIN`. Historic “Previously Featured” sections are deliberately excluded.
Remix/derivative credit entries are flagged without inventing additional grants.
`levels/dummy.wad`, `levels/test_levels.wad` and `musics/dummy.mid` lack a current
campaign credit join and are explicitly listed separately. This is source
selection evidence; it is not an inventory of every lump in a built WAD.

## Concrete shared engine recommendation

Evaluate direct **libretro PrBoom** source at
[`ddea2c6c041f7790c7bcf1dc3c1fe73b6cff0516`](https://github.com/libretro/libretro-prboom/tree/ddea2c6c041f7790c7bcf1dc3c1fe73b6cff0516)
with a minimal Akeru frontend. Its
[README](https://github.com/libretro/libretro-prboom/blob/ddea2c6c041f7790c7bcf1dc3c1fe73b6cff0516/README.md)
explicitly identifies Freedoom Phase 1/2, libretro input/savestates and an embedded
engine resource WAD. The
[Makefile](https://github.com/libretro/libretro-prboom/blob/ddea2c6c041f7790c7bcf1dc3c1fe73b6cff0516/Makefile#L310)
has an Emscripten static bitcode target; it does not supply a finished Akeru web
runtime. Start evaluation with threads and optional FluidSynth disabled to bound
the source/dependency set. These are proposed settings, not a verified build.

This recommendation resolves an identifiable upstream candidate, not its full
source audit: GPL declarations, actual compiled libretro-common/audio code,
embedded resource-WAD provenance, frontend, final linker/toolchain and source
redistribution package still need review. FreeDM's useful permitted local mode
is a distinct feasibility decision; Phase 1/2 support does not establish bots.
Never package commercial IWADs or an unrelated demo's game data.

## What this closes and what remains

For source-inventory/clearance engineering, this supplies actual file-group
notice classification, scoped claims versus direct headers, mixed-license
exceptions, current music/map credit joins, and a concrete engine-source
recommendation. It does **not** complete all title clearance: upstream rights
unknowns above and the selected engine's dependency/resource audit remain source
work. Open Golf, IsoCity, Server Survival, Whatajong, Hextris, optional 2048 and
later Hypersomnia retain their earlier inventories; this audit adds no new
file-group review for them.

Later title ports must produce selected-mod/patch inventories, exact dependency
and toolchain pins, reproducible source-linked artifacts, generated WAD/asset
lineage, complete distribution notices and commercial-data exclusion evidence.
Controller/touch/saves, device performance and FreeDM mode testing belong to
port/QA evidence, not a retroactive condition for reading upstream licenses.
Owner licensing, branding, privacy, content and publication decisions remain
separate and pending.

## Verification

`npm run check` validates coverage, exact source pins, direct-versus-inherited
claims, unresolved conflicts, credit-map coverage and the unchanged pending
status. It rejects attempts to hide GPL file declarations under the root BSD
claim. To independently verify inspected bytes against a pinned source checkout:

```sh
node scripts/validate-rights-audit.mjs anarch /path/to/pinned/anarch
node scripts/validate-rights-audit.mjs freedm /path/to/pinned/freedoom
```

The optional directory verification only reads files and hashes them; it never
invokes upstream build scripts. Without that directory, validation checks the
committed evidence structure and inventory identities, not remote content.
