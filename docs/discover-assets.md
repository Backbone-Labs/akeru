# Discover imagery

Game imagery comes from each title’s existing catalog cover; selecting a feature does not change its source, license, approval status or publication eligibility.

The Home feature grid's Backbone card uses `platform/catalog/backbone-pro.png`, supplied by Kishan on September 22, 2026 with an explicit request to use it on the site. The original PNG is served unchanged, locally with the catalog shell. Its app and controller links use the existing shell-owned promotion destinations and never receive title, save or account data.

This Backbone product image is excluded from the repository’s MIT license. The user authorized its use in this site; no broader third-party redistribution license is asserted. It is not included in any game package.

## Console covers

Home, Discover, Library and the game sheet use each title's existing catalog
cover. The earlier generated concept illustrations have been removed from the
site and packaging at the user's request. Covers do not change a title's license,
review status or publication eligibility.

## Console hub data

Saved games (`akeru.library.v1`) and play history (`akeru.recent.v1`) are
shell-owned lists of title ids in this browser's storage. Games never receive
them, and they are not synced. Save management in the game sheet uses the same
host-owned guest save store that titles write through; the sheet lists, exports,
deletes or resets only the selected title's local slots.

## Interface font

`platform/catalog/manrope.ttf` and its adjacent `manrope-OFL.txt` were obtained
from the official Google Fonts repository at commit
`b31870aff700ab7a1d74fa0c6887d95beb9e0037`, under `ofl/manrope/`:
[Manrope source](https://github.com/google/fonts/tree/b31870aff700ab7a1d74fa0c6887d95beb9e0037/ofl/manrope).
The font is distributed unchanged under its bundled SIL Open Font License 1.1.
It is served locally; the UI makes no Google Fonts network requests.
