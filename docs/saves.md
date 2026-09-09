# Durable guest saves

The trusted catalog binds IndexedDB storage to a validated title ID. Games receive
only read, conditional write, conditional remove and status operations through the
existing source/origin/nonce/sequence-checked runtime channel. Messages cannot pick
another title, a user identity, a database, or a storage path. Reset/export/migration
remain host operations. Save contents and errors containing internals never enter
shell telemetry or error replies.

Each write commits its data and a new opaque revision in one IndexedDB transaction.
The promise resolves only after transaction completion. A stale expected revision
fails rather than overwriting another tab's update. Removing and recreating a slot
produces a new revision. New schema versions require explicit migration; rollback
must preserve newer data instead of silently rewriting it. Failed migration leaves
the previous record intact. The database name is stable across title releases.

The default host policy is 16 slots and 1 MiB per slot. The message bridge permits
four concurrent requests and bounds write payloads at 1 MiB. Storage can be blocked,
full, evicted or corrupt. There is no memory fallback claiming durability. The UI
reports unavailable storage, and export/reset operate only on the selected title.
Reset requires an explicit second action. Exports contain game progress and should
be kept private. Browser storage does not transfer automatically between a standalone
browser and a native WebView.

## Original fixture

Orbit study now autosaves position every 750 ms after loading a valid save. It
restores position on the next launch, and pauses autosave attempts on a revision conflict
until reopened. Corrupt or unavailable data never gets silently replaced. This is a
checkpoint demonstration, not a promise that closing a page preserves every frame.
Title adapters should checkpoint during gameplay instead of relying on unload.

## Cloud integration remains required for P0

This change supplies durable guest storage, not a connected account service. No
sign-in control pretends to work, and sync status remains disabled. VAN-7465 is not
complete until a server-authorized save service, trusted browser/app session flow,
version history and guest-to-account migration are connected and tested.

The backend must derive identity from a trusted session, enforce title/user scope,
perform conditional writes, retain prior versions and prevent deletion resurrection.
Guest migration must preserve the local copy until durable acknowledgement; divergent
local/cloud saves require explicit conflict resolution. Account switching must isolate
queued writes. Broad native tokens must never enter game frames, URLs or storage APIs.

Required connected evidence includes two browser profiles transferring the same
account's save, cross-account/title denial, interrupted migration/retries, expiration,
logout/account switch, conflict resolution, retention and deletion. Local/fake storage
tests do not substitute for this evidence.
