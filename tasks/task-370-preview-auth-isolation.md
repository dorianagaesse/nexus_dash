# TASK-370: Preview Authentication and Database Isolation Guardrails

## Problem

The URL used for preview testing was a mutable Vercel alias that currently
targets production. Vercel Preview also used that alias for `NEXTAUTH_URL` and
OAuth callback overrides, so origin-dependent auth flows could leave a valid preview. Although Preview and
Production use distinct Supabase projects today, neither runtime was pinned to
an expected project ref and preview artifacts were published without checking
the Vercel target or application readiness metadata.

## Delivery Contract

- Preview auth origins come from the immutable Vercel deployment URL.
- Runtime and migration connections match the environment's expected Supabase
  project ref.
- Preview deployment artifacts are emitted only after target, revision,
  environment, and database-readiness validation.
- Deployed signup/signin remains on the preview origin.

See `tasks/current.md` for acceptance criteria, definition of done, and runtime
assumptions.
