# Akeru

A platform for browser-playable games: Backbone ports first, indie games next,
and community-created games through the same package and review contracts.

This repository contains the platform foundation. No game has been approved or
published by creating this repository. Games retain their own licenses; the
platform license does not relicense third-party code or assets.

## Development

Use Node.js **24.19.0** and npm **11.17.0** (also recorded in `.node-version`
and `package.json`). From a clean checkout:

```sh
npm ci --ignore-scripts
npm run check
npm run package:source
```

The last command requires a clean Git checkout. It writes a source archive and
SHA-256 provenance under `dist/source/`; it does not publish a game or deploy a
website. CI runs the same checks, audits dependencies and retains the archive.

Initial work is split into compliance evidence, reproducible project tooling,
and versioned title-package/runtime contracts. Gameplay is intended to be free,
with controller and touch support and optional account-linked save sync.

## Repository boundaries

- `packages/`: independently versioned platform packages and shared tooling.
- `scripts/`: repository checks and source packaging.
- `tests/`: repeatable automated verification.
- `docs/`: architecture, contribution and operating decisions.

Package contracts and compliance records are developed in separate initial PRs.
The foundation contains no production catalog, authentication service, cloud-save
implementation, native input bridge or game distribution. Those require their
own implementation and validation.

Read the [architecture](docs/architecture.md), [hosting and release plan](docs/operations.md),
[contribution guide](CONTRIBUTING.md) and [security policy](SECURITY.md).
