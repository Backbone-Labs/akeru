# Title evidence workflow

Backbone ports, indie submissions and community or AI-assisted games follow the
same dossier format. Creator tier is provenance metadata, not a permission grant.
This initial inventory contains research candidates, not a launch catalog. No
title, release or asset has been approved by adding these records.

## Start a dossier

1. Copy `compliance/dossier.template.json` into your title's contribution. Replace
   every placeholder; the template deliberately fails validation until its source
   has an immutable commit. Add the completed draft to `compliance/candidates.json`
   while this repository uses a single inventory.
2. Confirm the title, edition and upstream identity. An observed commit is a
   research baseline. Select a release independently and record its version,
   SHA-256 artifact digest and complete source inventory (game, engine, patches,
   assets and build recipes as applicable). Changed source selection needs review.
3. Work through every checklist in `compliance/policy.v1.json`. Record exact
   public source permalinks and release-specific evidence. Document unresolved
   rights as unknown; a top-level license does not clear bundled assets or code.
4. An accountable reviewer records completion for each section, with timestamp
   and evidence. A section cannot be complete with missing evidence. Review
   records must explain how the checklist was satisfied, including any justified
   non-applicability. Do not insert a fictional reviewer or blanket approval.
5. After identity, release and all sections are complete, an authorized approver
   may record their decision. Set `approval.reviewedContentDigest` to the value
   returned by `dossierDigest(dossier)` from the validator module. Any change to
   the reviewed content invalidates that decision; reset it to pending and seek
   a new review. Rejection decisions also bind to the reviewed content.
6. Run `node scripts/validate-compliance.mjs` and `npm run check`. Include the
   evidence and unresolved issues in the contribution for human review.

The JSON Schema describes the record structure for editors. The executable
validator additionally checks current policy, exact source pins, completeness
and stale decision digests. `publicationEvidenceErrors` is a necessary evidence
check, **not a publication gate by itself**. It cannot verify that a cited document
is true, that a reviewer is authorized, or that rights have been cleared. A future
trusted publication service must authenticate the reviewer, verify evidence and
bind its separate authorization to the same title, release digest and policy
revision. Do not trust approval fields supplied by a game or submission client.
Host capability grants remain separate from both evidence and publication.

## Scope of review

- Inventory code, dependencies, patches, fonts, art, audio, levels, generated
  assets, toolchains and redistribution/source obligations separately. Platform
  MIT licensing does not relicense a title, including an indie's original game.
- Use only specifically reviewed game data. **Commercial Doom data is prohibited**;
  compatibility with its formats is not permission to bundle it. Freedoom data and
  engine need independent review. FreeDM needs demonstrated local or bot play.
- Every published title must support guest play, controller and touch. Record
  actual browser/WebView testing, not only native engine support. WebGPU and
  shared-memory features need declared capabilities and compatibility evidence.
- Review guest saves and optional account-linked cloud sync, migration, conflict
  handling, deletion and retention. Games use host-owned interfaces; they receive
  no account credentials, arbitrary user selector or cross-title storage access.
- Inventory outbound requests, upstream trackers/ads, host telemetry and marketing
  attribution separately. Review consent and identifier handling; do not assume
  game license terms authorize collection or account linking.
- Review naming, age/content suitability, online features, supported regions,
  notices, maintainer responsibility, incident response, withdrawal and rollback.

The [Anarch and shared Freedoom source-rights audit](source-rights-audit.md) adds
file-group declarations, mixed-license exceptions and current map/music credit
joins. The [remaining-candidate audit](other-candidate-rights.md) completes grouped
source coverage for every candidate. These records do not change approval status.

## Candidate-specific work still open

| Candidate | Concrete next evidence |
| --- | --- |
| Anarch | Confirm edition/mods; pin browser toolchain and prove web input/saves. |
| Open Golf | Map fonts/assets/dependencies; test threaded WebGL2 build and input. |
| Freedoom Phase 1 / Phase 2 | Select engine and data release; map sources, notices and generated WAD contents. |
| FreeDM | Same source review plus proof of useful local/bot play. |
| IsoCity | Confirm builder scope; map assets/helper code and mobile input adaptation. |
| Server Survival | Pin externally loaded scripts and prove placement/camera controls. |
| Whatajong | Confirm modern solitaire identity; remove upstream telemetry and audit art/audio/fonts. |
| Hextris | Review GPL/source delivery and assets; remove ads and upstream analytics. |
| 2048 (optional) | Confirm implementation; map fonts/images and adapt input/save behavior. |
| Hypersomnia (future) | Resolve code/content exceptions, online services and operating model before considering integration. |

These are 11 previously investigated experiences. Candidate inclusion does not
settle the launch selection or exclude other future submissions. No engine has
been selected for the Freedoom experiences. There are no game binaries or assets
in this inventory. Evidence links identify public originals; private research,
personal data and access credentials must stay outside public contributions.

## Evolution

Dossier schema, policy revision and game release version are independent. A policy
change requires a new explicit revision and review rules; do not silently reinterpret
old decisions. Keep older records with their policy and release identities when a
future registry gains history. Submission portals and AI creation tools should
produce this same evidence, with no special approval bypass. The first version
supports Git-backed sources; extend the versioned format deliberately for other
immutable source archives rather than weakening the commit requirement.

## Reproducible file baseline

`compliance/source-inventories/index.json` maps every candidate to a complete
tracked-path inventory at its observed commit. The three Freedoom experiences
share one source tree, but need separate generated-output inventories. The nine
upstream inventories contain 11,061 non-directory entries, captured from
untruncated GitHub Git trees and all pages of the Anarch GitLab tree. Each entry
records its exact Git object identity and mode. Symlinks and submodules are
identified, never followed. These are source baselines, not selected releases.
No upstream game bytes are included in this repository.

To reproduce from a locally available upstream Git checkout without running its
build or scripts:

```sh
node scripts/source-inventory.mjs /path/to/upstream FULL_COMMIT https://example.org/upstream /tmp/inventory.json
```

The command reads committed Git objects, ignores working-tree modifications and
refuses to overwrite an existing output. Compare its output to the corresponding
inventory before attaching findings. A changed pin needs a new inventory and
review. A submodule entry identifies only its commit: inventory the referenced
repository independently. Remote dependencies, toolchain ports, downloaded fonts,
generated files and final network traces are not covered by a tracked-path list.

`compliance/source-evidence.json` records content SHA-256, byte length and Git
object identity for selected evidence files whose locally inspected bytes match
the pinned upstream tree. A missing file in this evidence index is not a negative
finding. It means this content verification has not been recorded. The candidate
dossiers summarize observed source findings and specific follow-up work.

Every file starts with `rightsStatus: unreviewed`. Do not infer a license from its
extension, parent directory, root license or the existence of a hash. The next
review must map each shipped file to applicable terms, provenance, modifications,
notices and corresponding-source obligations. Do not replace this mapping with a
blanket approval of the source tree.

Before a title is cleared, its owner must confirm the actual launch edition and
release, resolve missing asset/dependency evidence, record brand/content/region
and privacy decisions, and approve the exact release dossier. This tooling can
merge independently, but it does not complete those title-clearance decisions.
