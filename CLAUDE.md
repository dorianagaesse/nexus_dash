# NexusDash — Agent Context

## Start Here

1. **Read `agent.md`** first — it defines your execution contract (startup context, validation rules, PR workflow, completion criteria).
2. **Then `project.md`** — current architecture, product scope, active priorities.
3. **Then `README.md`** — runtime setup, env contract, scripts, CI/CD, testing.

## Context File Map

| File                            | Purpose                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `agent.md`                      | **Your workflow contract.** Startup checks, PR rules, validation baseline, completion criteria, doc update rules. |
| `project.md`                    | **What exists.** Architecture snapshot, data model, known gaps (active priorities live in the Nexus Dash kanban). |
| `README.md`                     | **Runtime reference.** Local setup, env vars, scripts, auth model, storage, CI/CD, testing, runbooks.             |
| `tasks/backlog.md`              | Migration record — the backlog now lives in Nexus Dash (see `.config/.nd-nexus-dash.env`).                        |
| `journal.md`                    | Execution log — blockers, decisions, validation outcomes.                                                         |
| `adr/decisions.md` + `adr/*.md` | Architecture decisions with rationale.                                                                            |

## Task Management (Nexus Dash)

The Nexus Dash kanban (<https://nexus-dash.app>) is the source of truth for
task status, sequencing, work-type/priority labels, epics, relationships, and
descriptions. The active task's card is also its brief — the repo-side
`tasks/current.md` was retired on 2026-09-12. Agent credentials live in
`.config/.nd-nexus-dash.env` (gitignored; committed template:
`.nd-nexus-dash.example.env`); exchange the API key at
`/api/auth/agent/token` for a short-lived bearer token at runtime.

Startup task selection: pick the task from the kanban (In Progress lane first,
then Backlog in lane order), move its card to In Progress, and work from the
card description (tighten its `Acceptance Criteria` / `Definition Of Done`
first if missing or vague). Follow the
"Creating a good Nexus Dash task" quality rules in `agent.md` (duplicate
check, outcome-oriented title, concise plain-English description,
`Rationale:`, one canonical work-type label `feature`/`fix`/`docs`/
`refactor`/`chore`, testable `Acceptance Criteria:`, and Related Tasks for
dependencies) — never raw `Dependencies:` prose in descriptions. Epic
descriptions follow the same rule: no dependency lists or split manifests —
they open with a `Recommended order:` path over the epic's linked task keys.
Cards with a counterpart GitHub issue or external resource attach it at
creation as a link attachment (`attachmentLinks` with `{ name, url }`); links
can also be added to existing cards with a task update (`PATCH` with an
`attachmentLinks` array) — details in `agent.md`.

**Status and comments:** move a card to In Progress when you start it. Never
move a card to Done — Done is set by the reviewer/PR merger. When the work is
complete, comment on the card only when there is relevant information to hand
over (decisions, validation results, blockers): plain English, short, straight
to the point.

## Workflow Rules

- **One task per branch/PR.** Branch from `origin/main` using the appropriate work-type prefix (`feature/*`, `fix/*`, `docs/*`, `refactor/*`, or `chore/*`) for your task. Use `git switch -c <prefix>/<id>-<slug> origin/main` to start from the latest remote `main`. Never commit directly to `main` or mix task work across different branches.
- **PR is mandatory** for any task or GitHub issue that changes repository contents, including docs-only changes.
- **Remote stays current.** Push the active branch after meaningful progress and again before handoff so the remote branch matches local completed work.
- **Startup:** select the task from the Nexus Dash kanban (see Task Management above). Ensure the card's description has `Acceptance Criteria` (and `Definition Of Done` when needed); tighten the card if missing.
- **Architecture:** persistence only in `lib/services/**`; API routes are thin transport adapters.
- **Secrets:** server env only via `lib/env.server.ts`; never commit secrets.

## Validation Before Handoff

Run before handoff unless the task is docs-only:

```bash
npm run lint && npm run rls:check && npm test && npm run test:coverage && npm run build
```

Also run `npm run test:e2e` when UI, auth, calendar, or upload flows are
touched. When Prisma models, RLS migrations, tenant ownership, or runtime
database roles change, run the real PostgreSQL RLS matrix (`npm run
test:rls:setup` then `npm run test:rls`, see
`docs/runbooks/rls-tenant-isolation.md`). Keep `git diff --check` clean.
Full contract: `agent.md` section 6.

## Updating Context After Work

In the same PR:

- Nexus Dash kanban — status moves, handoff comments, sequencing, and new tasks
- `journal.md` — log execution events, blockers, decisions, validation outcomes
- `adr/decisions.md` or `adr/*.md` — architecture-impacting decisions only

Do not update `project.md` or `README.md` in a feature PR — those are maintained separately.
