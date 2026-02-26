# NexusDash Agent Operating Guide

This file defines repository-specific execution rules. Keep it focused on workflow and boundaries; rely on platform/system defaults for generic coding behavior.

## 1. Startup Context (Per Task)

Before coding, align on these files:

1. `tasks/current.md` (active scope and acceptance criteria)
2. `project.md` (current architecture/product snapshot)
3. `README.md` (runtime/env/test contract)

If `tasks/current.md` is complete or invalid, pick the next `Pending` item in `tasks/backlog.md`, then update `tasks/current.md` before implementation.

## 2. Execution Contract

- One task per branch and one task per PR.
- Branch name must match CI rule: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, or `chore/*`.
- Keep PRs single-purpose; do not mix unrelated backlog tasks.

## 3. Architecture Boundaries (Non-Negotiable)

- Persistence access (`@/lib/prisma`) stays in `lib/services/**` only.
- API routes and server actions are transport adapters:
  - parse input
  - call services
  - map response/redirect
- Authorization checks must be enforced in services for project-scoped operations.

## 4. Documentation Update Rules

Update docs in the same PR when behavior/architecture changes:

- `tasks/current.md`: progress + status
- `tasks/backlog.md`: sequencing/added tasks if scope evolves
- `journal.md`: meaningful execution events, blockers, decisions, validation outcomes
- `adr/decisions.md`: architecture-impacting decisions
- Add/extend a task ADR in `adr/` only when a decision needs deeper rationale

## 5. Validation Baseline

Run before handoff (unless task is docs-only):

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

Use `npm run test:e2e` when UI flows, auth flows, calendar flows, or upload flows are touched.

## 6. Environment and Secrets Discipline

- Server env access must go through `lib/env.server.ts`.
- Never commit secrets.
- For deploy-affecting changes, validate contracts in:
  - `README.md`
  - `docs/runbooks/vercel-env-contract-and-secrets.md`
  - `docs/runbooks/database-connection-hardening.md`

## 7. Completion Criteria

A task is complete only when:

1. Acceptance criteria in `tasks/current.md` are satisfied.
2. Required validation is green.
3. Tracking docs (`tasks/current.md`, `journal.md`, `adr/decisions.md` when applicable) are updated and consistent.
