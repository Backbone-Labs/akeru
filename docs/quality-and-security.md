# Quality and security gates

A green check is evidence of a specific automated check, not architecture approval
or production readiness. Review the changed code, PR evidence and applicable
PRD acceptance criteria as well as the checks.

## Required PR checks

| Check | Evidence |
| --- | --- |
| Lint | ESLint recommended correctness rules, unused values, strict equality, no dynamic eval or Function constructors; warnings fail |
| Formatting | Prettier for JS, declarations, browser styles/markup and CI YAML |
| Public API types | Strict TypeScript compilation of SDK declarations and positive/negative integrator examples |
| Tests | Node unit/contract tests, negative isolation/publication tests and public-source guards |
| Dependency audit | npm registry advisories; high/critical findings fail |
| Browser tests | Real Chromium desktop/mobile viewport flows using the original local demo and packaged empty catalog |
| Catalog and provenance | Source archives, staging and catalog Workers, syntax and complete local asset integrity verification |
| Analyze (actions), Analyze (javascript-typescript) | GitHub-managed CodeQL extended queries, remote and local threat sources |

The type check covers public declarations and their consumers. It does not yet
check every JavaScript function body or prove that runtime implementations match
all declarations. Runtime and browser tests remain necessary. Formatting skips
large rights-evidence JSON records and generated files; it does not rewrite
upstream evidence. Playwright uses its exact pinned dependency and Chromium on CI;
a local installed Chrome can be selected explicitly as documented in browser testing.

CodeQL uses GitHub default setup, so it scans main before merge protections are
enabled, then pull requests/pushes and the managed periodic schedule. It is not a
second custom workflow. `.github/codeql-settings.json` records the expected
repository setting. Scan execution must pass, and the code-scanning ruleset also
blocks qualifying high/critical security findings and error-level findings.
A successful analysis alone is not equivalent to having no findings.

## Merge policy

`.github/main-ruleset.json` records the expected active repository ruleset:

- Pull requests only; one approving review from someone other than the latest pusher.
- New reviewable pushes invalidate prior approval; resolve review conversations.
- All named checks must pass against current main, from GitHub Actions.
- No force pushes or deletion, and no configured actor/admin bypass.
- CodeQL results required for the change and target, with the severity gates above.

The PR author cannot approve their own PR. A maintainer with review permissions
must review it. No particular reviewer or CODEOWNERS team is invented here.
Repository administrators can change settings; normal merge bypass is disabled.
Changes to workflow, public API, isolation, release and account boundaries deserve
review by the relevant Backbone engineering owner.

Inspect actual settings with `gh api repos/Backbone-Labs/akeru/rulesets` and
`gh api repos/Backbone-Labs/akeru/code-scanning/default-setup`. The JSON in this
repository documents intended policy; it cannot enforce GitHub settings by itself.
Apply changes only after the actual named checks have completed successfully.

## Local verification and release limits

Run `npm ci --ignore-scripts`, `npm run lint`, `npm run format:check`,
`npm run typecheck`, and `npm run check`. Then build the committed catalog with
`npm run package:catalog` and run `npm run test:browser`. Use `npm run format` to
format source changes; if original fixture bytes change, update their recorded
artifact hashes as part of the same reviewed change. Never update third-party
source evidence hashes simply to silence a failure.

CI has read-only repository permissions and no production credentials. Checkout
credentials are not persisted. It never deploys, approves game rights or enables
publication. Secret scanning and push protection remain enabled separately.

Physical controller/touch devices, iOS/Android WebViews, native routing, durable
save/account services, title clearance, hosted verification and independent
security review remain release gates. The browser suite uses synthetic input;
passing it does not establish hardware or WebView support. Coverage percentages
are not a substitute for meaningful boundary tests, and no arbitrary coverage
threshold is claimed.

## Initial security scan follow-up

The initial extended CodeQL scan reported existing alerts; enabling scanning is
not a clean security certification. Read-only triage found deliberate attack
fixtures and operator-controlled CLI inputs among the reports, but also local
validation resource amplification and filesystem race/symlink hardening work.
Keep those alerts open until individually resolved or reviewed with evidence.
Before accepting community uploads, bound manifest size and validation work,
and harden source-file containment against symlink changes. The current CLI
packaging flow is not an untrusted upload service. No alert was dismissed merely
to make this quality-gate change pass.
