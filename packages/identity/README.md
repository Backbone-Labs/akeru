# Host session client

`@akeru/identity` is a trusted-shell session client, separate from game contracts.
It is the first portion of identity integration, not a sign-in provider or a
connected cloud-save service. The catalog does not enable login until the private
session endpoints and registered sign-in flow are available.

Use `refresh()` to read the shell's HttpOnly-cookie-backed session. Before account
work, acquire a `lease()`, pass its abort signal to transport and check
`isCurrent()` before accepting a result. Refresh, logout, expiry and disposal
invalidate existing leases. Account-local data must be keyed by the opaque
partition, separate from guest saves. A partition is not a credential. Never
expose this client, its snapshots or leases through the title bridge.

A failed logout leaves status `unavailable`, not `guest`: server revocation is
unconfirmed. Existing leases remain invalid. The host must offer session recovery
through `refresh()` and retry logout after recovery; guest gameplay still works.

## Private server contract to implement

All responses are JSON, at most 4 KiB, with `Cache-Control: no-store`. These are
same-origin HTTPS endpoints; no CORS identity API or redirect responses.

- `GET /api/akeru/session` returns 200 with `{ "status": "guest" }`, or exactly
  `{ "status": "authenticated", "partition": "<opaque value>", "expiresAt": 0,
  "csrfToken": "<opaque value>" }`. `expiresAt` is the real future expiry in epoch
  milliseconds. Partition and CSRF token are 32–128 base64url characters. Issue
  partitions server-side, scoped to the account and suitable for private local
  cache isolation; do not return email, user ID, access tokens or refresh tokens.
- `POST /api/akeru/logout` verifies the session-bound `X-Akeru-CSRF` token and
  exact allowed Origin, durably revokes the session, expires the cookie, then
  returns 200 `{ "status": "guest" }`. Failure must not return success.
- The server owns Secure/HttpOnly host-only cookies, session renewal and expiry,
  account verification, CSRF protection and sign-in state/nonce/code binding.
  This client cannot enforce those server guarantees. It must run on the configured
  shell origin; `mode`/`credentials: same-origin` do not enable cross-origin use.
- Save writes must independently authenticate and bind each request to its intended
  session/account on the server. Aborting a fetch does not undo a server commit.
  The server must reject account/session mismatches rather than trusting a client
  partition. Queue migration, conflict resolution and durable acknowledgements
  are separate save work and are not implemented by this package.
- Cross-tab sign-out/account-change notifications should invalidate other clients
  (dispose/recreate or refresh); each server operation must validate the current
  session even before such a notification arrives. This package does not yet wire
  those notifications or the catalog UI.

Unknown fields are rejected to prevent accidental broad-token responses from
becoming a supported contract. Error messages never include response bodies or
transport exceptions. No tokens are persisted in browser storage.
