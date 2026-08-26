# TASK-406: Stable Preview OAuth Alias After Immutable Validation

## Problem

Immutable Vercel deployment URLs are the correct evidence for the exact branch
and revision under test, but GitHub and Google OAuth applications cannot be
updated for every generated deployment hostname. The provider-registered static
Preview URL therefore needs to follow the current validated deployment without
becoming an unchecked route to production or a stale revision.

## Delivery Contract

- `PREVIEW_AUTH_ORIGIN` names the one stable HTTPS Preview alias accepted for
  provider-backed OAuth; arbitrary aliases remain untrusted.
- The immutable deployment must pass project, target, revision, environment,
  migration-project, and database-readiness validation before the alias moves.
- After assignment, the workflow proves the alias resolves to the same Vercel
  deployment and repeats readiness validation through the alias.
- Testers use the immutable URL as deployment evidence and the stable URL for
  GitHub/Google OAuth flows.

See `tasks/current.md` for acceptance criteria, definition of done, and runtime
assumptions.
