# NexusDash — Agent Context

## Start Here

1. **Read `agent.md`** first — it defines your execution contract (startup context, validation rules, PR workflow, completion criteria).
2. **Then `project.md`** — current architecture, product scope, active priorities.
3. **Then `README.md`** — runtime setup, env contract, scripts, CI/CD, testing.

## Context File Map

| File | Purpose |
|------|---------|
| `agent.md` | **Your workflow contract.** Startup checks, PR rules, validation baseline, completion criteria, doc update rules. |
| `project.md` | **What exists.** Architecture snapshot, data model, known gaps, active priorities (TASK-124/126/127/131). |
| `README.md` | **Runtime reference.** Local setup, env vars, scripts, auth model, storage, CI/CD, testing, runbooks. |
| `tasks/current.md` | Active task scope with acceptance criteria and definition of done. |
| `tasks/backlog.md` | Pending/completed task queue and sequencing. |
| `journal.md` | Execution log — blockers, decisions, validation outcomes. |
| `adr/decisions.md` + `adr/*.md` | Architecture decisions with rationale. |

## Workflow Rules

- **One task per branch/PR.** Branch from `main` using `chore/issue-XXX-description` for all task work. Never commit directly to `main` or mix task work across different branches.
- **Start from main.** Before beginning work, `git fetch origin main` and branch from the latest `main` to avoid mixing unrelated commits into your task branch.
- **PR is mandatory** for any task or GitHub issue that changes repository contents, including docs-only changes.
- **Remote stays current.** Push the active branch after meaningful progress and again before handoff so the remote branch matches local completed work.
- **Startup:** read `tasks/current.md` before implementing. Ensure it has `Acceptance Criteria` and `Definition Of Done`; add/tighten if missing.
- **Architecture:** persistence only in `lib/services/**`; API routes are thin transport adapters.
- **Secrets:** server env only via `lib/env.server.ts`; never commit secrets.

## Validation Before Handoff

```bash
npm run lint && npm test && npm run test:coverage && npm run build
```

For UI/auth/calendar/upload flows: also `npm run test:e2e`.

## Updating Context After Work

In the same PR:
- `tasks/current.md` — mark done, update status
- `tasks/backlog.md` — sequencing changes if scope evolved
- `journal.md` — log execution events, blockers, decisions, validation outcomes
- `adr/decisions.md` or `adr/*.md` — architecture-impacting decisions only

Do not update `project.md` or `README.md` in a feature PR — those are maintained separately.
