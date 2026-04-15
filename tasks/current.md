# Current Task: TASK-105 Convex Migration Assessment - Fit, Tradeoffs, And Migration Risk Review

## Task ID
TASK-105

## Status
In Progress

## Objective
Produce a grounded, repo-specific assessment of whether NexusDash should move
from its current `Prisma + PostgreSQL + Supabase-hosted Postgres` baseline to
Convex, then turn that assessment into a clear written recommendation with
explicit migration risks, benefits, and revisit conditions.

## Why This Task Matters
- `TASK-056`, `TASK-057`, and `TASK-085` deliberately established the current
  data/runtime baseline around PostgreSQL, Prisma-owned migrations, and
  database-level RLS.
- The backlog now includes collaboration and realtime-oriented follow-ups,
  especially `TASK-118`, which makes Convex a reasonable technology to
  reassess instead of dismissing abstractly.
- A platform pivot is expensive. This task exists to replace hand-wavy
  "Convex might be better" thinking with a written decision-quality artifact
  tied to the actual NexusDash architecture.

## Scope
- Audit the implemented repository architecture relevant to a data-platform
  change:
  - data model shape
  - Prisma usage and migration ownership
  - PostgreSQL RLS dependence
  - auth/session boundaries
  - agent access model
  - attachment/storage strategy
  - calendar and external API integration patterns
- Review current official Convex and Supabase documentation.
- Compare the current stack against Convex specifically for this repo, not for
  generic greenfield apps.
- Produce a durable assessment document in `adr/`.
- Open a dedicated PR for the investigation and monitor Copilot review to first
  completion, addressing valid feedback in-thread.

## Out Of Scope
- Migrating any runtime code or schema to Convex.
- Replacing Prisma, Postgres, Auth.js-compatible sessions, or RLS in this task.
- Building a proof-of-concept dual-write or hybrid Convex/Postgres data layer.
- Inventing performance claims without evidence from the current repo or
  official product documentation.

## Investigation Questions
1. Where would Convex materially improve NexusDash compared to the current
   stack?
2. Which current architecture choices make a Convex migration expensive or
   risky?
3. Would a migration simplify the hardest current problems, or mostly replace
   one set of tradeoffs with another?
4. If the answer is "not now," under what future product conditions should the
   decision be revisited?

## Expected Output
- a precise `tasks/current.md` brief for `TASK-105`
- a durable assessment document in `adr/` with:
  - current architecture snapshot
  - Convex fit analysis
  - pros and cons
  - migration scope and risk review
  - recommendation and revisit conditions
- tracking updates in `tasks/backlog.md`, `journal.md`, and `adr/decisions.md`
  as appropriate
- a dedicated PR with Copilot review triaged before handoff

## Acceptance Criteria
- The assessment is based on the implemented repository state rather than only
  backlog labels or generic platform marketing.
- Official current documentation for both Convex and Supabase is incorporated
  into the comparison.
- The output states a clear recommendation, not just a list of features.
- Migration risks cover at minimum data model, authorization/RLS, auth/session
  model, storage, background work, testing/CI, and operational impact.
- A PR is opened for the investigation, Copilot completes its initial review
  state, and any valid review feedback is handled.

## Definition Of Done
1. `TASK-105` is the active task in `tasks/current.md` and is at the top of the
   execution queue in `tasks/backlog.md`.
2. A durable written assessment exists in `adr/` and is specific enough to
   guide future platform decisions.
3. Tracking docs are updated consistently with the assessment result.
4. A dedicated PR exists for this task, Copilot has finished its initial review
   pass, and all valid comments have been addressed or answered with rationale.

## Dependencies
- `TASK-056`
- `TASK-057`
- `TASK-085`
- official current Convex documentation
- official current Supabase documentation

## Evidence Plan
- Repo source of truth:
  - `project.md`
  - `README.md`
  - `prisma/schema.prisma`
  - `prisma/migrations/**`
  - `lib/services/**`
  - `lib/auth/**`
  - `adr/decisions.md`
  - `adr/task-056-data-platform-adr.md`
  - `adr/task-020-modern-auth-authorization-adr.md`
  - `tasks/task-085-postgresql-rls-staged-rollout.md`
- External source of truth:
  - official Convex docs
  - official Supabase docs

## Validation
- This is a documentation/investigation task, so code validation commands are
  optional unless a follow-up edit expands scope beyond docs.
- Minimum validation for this task:
  - review the written assessment for internal consistency against repo code
  - ensure the PR body clearly summarizes the recommendation and evidence base

---

Last Updated: 2026-04-15
Assigned To: Agent
