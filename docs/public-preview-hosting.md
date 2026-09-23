# Public evaluation hosting

The explicit public preview is separate from production title publication. It
uses the existing evaluation factories and leaves rights status unchanged. It
must not be described as mobile-conformant or as account-linked cloud saving.
The production catalog packager and its publication gates remain unchanged.

`scripts/package-public-preview.mjs` packages built title artifacts, verifies
hashes, and creates isolated static title deployments plus the website shell in
ignored `dist/public-preview`. Nothing is deployed by this script. Each title
gets its own immutable deployment origin; never combine them under the shell
origin or use the mutable shared game-project alias in the registry.

Set `ANARCH_SOURCE` to the pinned checkout and
`AKERU_FREEDOOM_SOURCE_ARCHIVES` to the build directory containing the verified
engine/data tar archives. The onboarding controller model is currently disabled; generated model assets
are removed from the website bundle. Build recipes are in each package.

1. Run `npm run check`, lint and type checks, then commit the source used for the
   build. The public source archive is generated from that commit.
2. Run `node scripts/package-public-preview.mjs` to prepare title bundles.
3. Deploy each `dist/public-preview/titles/<id>` to the dedicated game project.
   Store its immutable HTTPS deployment origin in a JSON object keyed by title
   ID. Project linking metadata and this deployment map stay outside commits.
4. Run `node scripts/package-public-preview.mjs <origins.json>` to rebuild the
   shell against the verified isolated origins. The script rejects missing,
   duplicate, non-HTTPS and shell-equivalent title origins. Do not deploy a shell
   whose `bundle.json` reports `ready: false`.
5. Deploy `dist/public-preview/shell` to the dedicated website project.
6. Verify the production website URL, every catalog entry and cover, a game
   launch from each engine family, guest save restoration, CSP and source links.

This preview targets `https://backbone-akeru.vercel.app`; title CSP only allows
that shell to embed games. The two new Akeru projects are public as requested;
this does not change deployment protection on other Backbone projects. Public
preview pages send `noindex, nofollow` to avoid treating this evaluation as a
search-indexed launch. No passwords, API tokens or backend service bindings are
part of the static deployments. The preview does not connect to account APIs.

Game source archives and compiled assets are deployment artifacts, never public
repository commits. The GPL engine previews provide pinned source downloads and
Akeru build recipes. These downloads do not fabricate a completed rights audit.
Rollback the website to its previous verified deployment to restore the previous
registry and title origins; retain immutable title deployments used by it.
