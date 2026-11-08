# ND-658: stable agent actors with separate runtime authentication

Status: accepted for implementation; 2026-11-06.

## Decision

Keep the existing `ApiCredential.id` as the stable identity anchor. Its legacy
storage name is a compatibility detail: task authors, assignees, mentions,
meeting todos, epics and historical snapshots already reference it. Renaming or
rekeying every actor relationship would add migration risk without changing the
product contract. The new public surface calls these records **identities**.
`label` remains the display name; ND-656 `descriptiveLabels` and optional
`avatarSeed` are descriptive profile fields. The shared public
`AgentAuthorIdentity` projection keeps linked comments on current names/labels,
including after deactivation; no second label model is introduced. Scope grants and the Done capability remain the
single source of identity permissions.

New `identityMode` anchors contain an unusable legacy hash and an incompatible
public key prefix. Legacy key rotation is explicitly denied. Existing anchors
remain compatible with the legacy exchange API; there is no destructive key or
actor migration. A later deprecation can remove legacy authentication columns
after consumers migrate, without changing logical actor IDs.

Separate `AgentRuntimeDevice`, `AgentRuntimeCredential` and
`AgentRuntimeSession` tables own runtime entitlement, authentication material and
execution lifetime. A device authorization binds exactly one identity. Multiple
authorizations may describe the same physical laptop; its name is not a hardware
attestation. This deliberately avoids giving a logged-in laptop implicit rights
to all project identities. Device and session bindings are immutable in SQL.

Owners authorize a ten-minute, single-use pairing code. The launcher exchanges
it for a 256-bit random device secret stored in the OS vault. Only SHA-256 hashes
are stored server-side; high-entropy credentials do not need password stretching.
A narrowly scoped security-definer function bootstraps owner RLS context from
an exact proof hash. All three tables use forced owner-only RLS through the
identity; ordinary clients cannot enumerate proofs before authentication.

Sessions retain initial scope/capability ceilings and issue signed tokens with
identity/project/device/session bindings. Every request intersects live identity,
device and session grants with token scopes. Revocation applies on the next
authorization check, including already-issued tokens. In-flight admitted work
may complete. Each device records its authorizing owner independently of the
identity creator. Ownership transfer invalidates prior-owner grants; the new
owner can authorize new devices without duplicating the persistent identity.

The launcher keeps device proofs and bearer tokens in its parent process and
uses an independent random loopback capability per child. It renews tokens
without identity fallback, strips inherited legacy agent secrets from the child
environment and ends sessions on normal exit. Crash cleanup is bounded by
session expiry. Same-user OS process isolation, distributed execution state,
scheduling and conflict resolution are explicitly outside this design.

## Consequences

- Credential/device revocation cannot delete actor attribution or assignments.
- Existing actor pickers and all historical relationships continue using the
  same IDs. Deactivation marks an actor inactive without erasing responsibilities.
- New runtime access is independent of legacy key rotation; existing legacy
  consumers retain their previous lifecycle and token-scope TTL behavior.
- Per-request database validation costs reads but avoids stale authorization
  caches and makes revocation behavior understandable.
- The helper needs an unlocked OS vault and the repository helper files. No
  fallback stores plaintext or exposes long-lived proofs to an AI client.
- Local API/E2E, launcher isolation tests and the real PostgreSQL role matrix
  cover fail-closed boundaries. Preview/deployment was explicitly excluded from
  this delivery by the requester.

## Integration with ND-657

Legacy bearer requests retain the current key-generation check. Runtime tokens
carry the signed identifier for consistency, but validated device/session access
is independent of raw-key rotation. Runtime requests still recheck identity,
device, credential and session revocation on every request.
