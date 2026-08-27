# TASK-326: Google Calendar Connection Ownership Hardening

## Status

Implementation complete (2026-08-06); ready for stacked review after TASK-325.

## Objective

Close the remaining lifecycle and enforcement gaps in the existing one-Google-
connection-per-user model without beginning the multi-account migration.

## Implementation Contract

- Treat only `revokedAt = null` credentials as operational for lookup, refresh,
  target update, and project connection status.
- Disconnect is authenticated-user-only, idempotent, and fail-closed: mark the
  row revoked, attempt Google refresh-token revocation, then delete local tokens
  even when upstream revocation cannot be confirmed.
- `DELETE /api/account/settings/google-calendar` means disconnect. Calendar
  target reset remains `PATCH` with an empty value.
- Require `GOOGLE_TOKEN_ENCRYPTION_KEY` whenever Calendar OAuth is configured
  outside tests and lazily encrypt legacy plaintext tokens on authenticated
  read.
- Settings provides accessible confirmation, pending, success, warning, and
  recovery states for disconnect.
- The project summary Calendar request includes its required `projectId`.
- Preview deployment verifies that every checked-out Prisma model still has a
  physical runtime table after migrations, before publishing the stable alias.
- OAuth token exchange and local credential persistence failures retain
  separate operator logs and user-facing error states.
- Preserve current project viewer/editor behavior; TASK-348 owns private versus
  shared schedule semantics.

## Acceptance Criteria

1. Revoked credentials cannot authorize reads, writes, refresh, or target
   updates.
2. Disconnect removes only the signed-in user's credential and never exposes a
   token or provider error payload.
3. Local tokens are deleted even when Google revocation fails, and the response
   reports whether upstream revocation was confirmed.
4. Calendar OAuth cannot run outside tests without an encryption key; legacy
   plaintext tokens are rewritten encrypted when safely read.
5. The connected dashboard summary successfully supplies project authorization
   context.
6. Unit/API/UI and real PostgreSQL RLS tests cover ownership and failure paths.
7. Shared Preview schema drift cannot masquerade as a successful deployment or
   an OAuth credential failure.

## Definition Of Done

- Runtime, tests, docs, ADR index, changelog, version, backlog, current task, and
  journal are consistent.
- Lint, RLS inventory/matrix, tests, coverage, build, and E2E pass.
- Branch preview is deployed from the explicit git ref and Calendar recovery
  states are validated.
- A ready-for-review PR is open and automated feedback is resolved.
