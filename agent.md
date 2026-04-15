# NexusDash Agent Operating Guide

This file defines repository-specific execution rules. Keep it focused on workflow and boundaries; rely on platform/system defaults for generic coding behavior.

## 1. Startup Context (Per Task)

Before coding, align on these files:

1. `tasks/current.md` (active scope and acceptance criteria)
2. `project.md` (current architecture/product snapshot)
3. `README.md` (runtime/env/test contract)

If the task touches auth, deploys, runtime validation, or external services,
make the task brief explicit before deep implementation:

- capture local prerequisites (for example PostgreSQL reachability)
- capture required runtime secrets/env assumptions
- capture deploy/review workflow assumptions when preview or production behavior
  is part of acceptance
- link the relevant runbook when preview validation is expected
- ensure `tasks/current.md` has explicit `Acceptance Criteria` and
  `Definition Of Done` sections; if either is missing or too vague, add or
  tighten them before implementation starts

If `tasks/current.md` is complete or invalid, pick the next `Pending` item in `tasks/backlog.md`, then update `tasks/current.md` before implementation.

## 2. Implementation Quality

- Write clean, maintainable code that follows established best practices and repository patterns.
- Prefer reusable components/modules and focused abstractions over duplication.
- Keep responsibilities well-separated and favor SOLID-oriented design when shaping services, components, and utilities.

## 3. Execution Contract

- One task per branch and one task per PR.
- Start each task on a dedicated branch before implementation work begins.
- Branch name must match CI rule: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, or `chore/*`.
- Dependabot-authored PRs are the one exception and may use `dependabot/*`.
- Keep PRs single-purpose; do not mix unrelated backlog tasks.
- Push the active branch remotely after meaningful implementation/validation progress and before handoff.
- If the current task does not already have an open PR, create one once the branch is reviewable; continue updating the same PR for that task.
- After the PR is first opened, monitor automated review/check feedback until Copilot has finished generating its initial review outcome, even when that outcome contains no inline comments.
- If Copilot completes its review and produces no comments, treat that as a clean review state with nothing further to handle.
- Triage Copilot review comments: apply relevant changes, respond on threads, resolve every conversation you addressed before handoff, and leave clear rationale when a suggestion is intentionally not applied.
- Final task/PR handoff must mention the commit SHA or SHAs that contain the delivered changes.
- When preview validation is part of the task, review, or acceptance flow, trigger a preview deploy from the active branch git ref through the expected workflow and include both the workflow reference and preview result in the handoff.

## 4. Architecture Boundaries (Non-Negotiable)

- Persistence access (`@/lib/prisma`) stays in `lib/services/**` only.
- API routes and server actions are transport adapters:
  - parse input
  - call services
  - map response/redirect
- Authorization checks must be enforced in services for project-scoped operations.

## 5. Documentation Update Rules

Update docs in the same PR when behavior/architecture changes:

- `tasks/current.md`: progress + status
- `tasks/backlog.md`: sequencing/added tasks if scope evolves
- `journal.md`: meaningful execution events, blockers, decisions, validation outcomes
- `adr/decisions.md`: architecture-impacting decisions
- Add/extend a task ADR in `adr/` only when a decision needs deeper rationale

## 6. Validation Baseline

Run before handoff (unless task is docs-only):

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

Use `npm run test:e2e` when UI flows, auth flows, calendar flows, or upload flows are touched.

## 7. Environment and Secrets Discipline

- Server env access must go through `lib/env.server.ts`.
- Never commit secrets.
- For deploy-affecting changes, validate contracts in:
  - `README.md`
  - `docs/runbooks/vercel-env-contract-and-secrets.md`
  - `docs/runbooks/database-connection-hardening.md`

## 8. Completion Criteria

A task is complete only when:

1. Acceptance criteria in `tasks/current.md` are satisfied.
2. Required validation is green.
3. Tracking docs (`tasks/current.md`, `journal.md`, `adr/decisions.md` when applicable) are updated and consistent.

Additional rule:
- Every active task brief must explicitly state both `Acceptance Criteria` and
  `Definition Of Done`.
- If a task is missing either section, the agent must add them before treating
  the task as ready for implementation.
