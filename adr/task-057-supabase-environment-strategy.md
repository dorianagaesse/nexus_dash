# TASK-057 Supabase Environment Strategy (Interim)

Date: 2026-02-15
Status: Accepted

## Context

- TASK-057 required a PostgreSQL migration target with low operational friction.
- Supabase project branching is currently unavailable on the active plan.
- In Supabase UI, the base branch is labeled `main (PRODUCTION)` and cannot be re-designated from the app side.

## Decision

Use a single Supabase project/branch (`main`) as an interim development runtime for now.

- Treat the current Supabase `main` as non-public pre-production usage until deployment milestone.
- Keep database changes managed by repository-owned Prisma migrations.
- Defer true environment split (dev/staging/prod) to deployment phases once plan/features support branching or additional dedicated projects are created.

## Consequences

- Faster delivery now with fewer platform blockers.
- Naming in Supabase UI (`PRODUCTION`) can be misleading; team discipline and documentation are required.
- A future environment split remains mandatory before broader rollout.

## Follow-up

- TASK-039..TASK-043: establish runtime/deployment baseline with explicit environment model.
- At deployment milestone, choose one:
  - enable Supabase branching and adopt `dev` branch workflow, or
  - create separate Supabase projects for dev/staging/prod.
