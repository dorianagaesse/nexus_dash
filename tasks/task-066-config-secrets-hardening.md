# TASK-066 Configuration/Secrets Hardening Gate

## Goal
Promote the current dev-ready configuration baseline to production-grade runtime guarantees.

## Scope
- Enforce startup fail-fast validation for server runtime configuration.
- Tighten Prisma env contract behavior:
  - `DATABASE_URL` remains required.
  - `DIRECT_URL` becomes required in production runtime.
  - Non-production fallback (`DIRECT_URL -> DATABASE_URL`) remains available.
- Enforce env consistency guardrails for optional auth/platform config:
  - `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` must be configured together.
  - `NEXTAUTH_URL` + `NEXTAUTH_SECRET` must be configured together.
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI` must be configured together.
- Add URL-shape validation for runtime URL variables.
- Ensure CI quality gates include minimal env values needed by startup validation.

## Acceptance
- App fails fast with explicit errors on invalid/partial runtime env.
- Production runtime refuses missing `DIRECT_URL`.
- Unit tests cover new env guardrail behaviors.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` pass locally.
- CI quality gates remain green on PR.
