# Working on Akeru

- Keep title-specific code in title packages. Backbone, indie and community
  packages use the same versioned contracts and validation path.
- Keep requested capabilities separate from host permissions and publication
  approval. A valid manifest is not permission to publish a title.
- Gameplay must support guest access, controller and touch. Guest local saves
  and optional account-linked cloud sync belong behind a host-owned interface;
  do not expose credentials or cross-title storage to games.
- Treat WebGPU as a declared capability, not a universal device assumption.
  Native input transport remains a replaceable provider, not broad native access.
- Do not include internal research, private repository references, credentials,
  third-party game binaries or unreviewed assets in public commits.
- Record unknown source/asset rights as unknown. Do not fabricate approvals.
- Use the pinned Node/npm versions, exact dependencies and root lockfile.
- Run `npm run check` for a change before proposing it for merge. Add meaningful
  negative tests for package validation, isolation and publication boundaries.
- Do not deploy, activate games, or change existing mobile/backend production
  systems as a side effect of local builds or tests.
