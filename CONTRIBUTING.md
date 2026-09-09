# Contributing

Use the pinned Node/npm versions and `npm ci --ignore-scripts`. Dependencies
must use exact versions in the root workspace lockfile. Do not run unreviewed
game build scripts during package validation.

1. Make a branch for one coherent change.
2. Add tests for changed behavior, especially invalid packages and denied
   capabilities. Keep original test fixtures small and independent of cloud
   credentials, commercial game data and physical devices.
3. Run `npm run check`. Document any device-specific verification separately;
   automated contract tests cannot certify controller or WebView compatibility.
4. Open a PR describing behavior, compatibility, source/asset changes and tests.
5. After committing, run `npm run package:source` to inspect release provenance.

Do not commit local research, secrets, proprietary implementation details,
unreviewed game binaries, or game data that cannot be redistributed. The public
platform license applies to original platform code; dependencies and future
game packages keep their own terms and notice requirements.

All creators use the same package contracts. Being a Backbone or verified-partner
contributor does not bypass validation, provenance or release review. A valid
package is a submission candidate, not an approved release. Self-service indie
and community submissions are not open yet; discuss proposed contributions in
a GitHub issue before contributing a title.
