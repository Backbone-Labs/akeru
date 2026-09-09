# `@akeru/saves`

Durable, title-scoped guest saves backed by IndexedDB. Construct one host store,
bind it to a trusted registry title ID and schema, then give only `binding.service`
to game code. The service supports defensive reads, compare-and-swap writes and
removals, bounded slot and byte quotas, and availability reporting. It never accepts
an account identity or credential.

The host binding also has `list()`, `exportData()`, `reset()` and `migrate()`.
Exports are JSON-serializable and encode record bytes as base64. Migration reads the
old schema without changing it, calls the adapter with a defensive copy, validates
the current-schema result, and commits only when the expected revision still matches.

Storage failures reject operations with a stable `SaveError.code`; `status()` instead
reports `local: 'unavailable'`. There is no memory fallback, and sync remains
`'disabled'` until a separate host-owned sync implementation supplies that state.
