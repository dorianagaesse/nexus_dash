# Current Task

## ND-366: Record Vercel Fluid compute decision and remediation program

## Status

Done (created in the Nexus Dash project kanban on 2026-09-01 under the
`Realtime Efficiency and Vercel Cost Control` epic).

## Context

The Vercel Hobby team exceeded its four-hour Fluid Active CPU allowance and
approached its provisioned-memory allowance. A repository and live-telemetry
investigation traced the material steady-state cost to the account notification
and project activity SSE routes: both recycle every 280 seconds and poll
PostgreSQL every second per open tab in Production and Preview. The team has
upgraded to Pro for immediate continuity, but the inefficient transport still
needs a recorded replacement program.

## Scope

- Record the measured CPU, memory, route, environment, and region evidence in
  `adr/decisions.md`.
- Record the decision to retain Vercel during remediation, use bounded adaptive
  polling as the immediate baseline, and target private Supabase Realtime
  Broadcast for true push.
- Capture the rejected immediate alternatives: treating Pro as the fix,
  migrating hosting before optimization, or moving the streams to Lambda.
- Create one Nexus Dash epic and all implementation/review tasks with explicit
  acceptance criteria, definitions of done, sequencing, and relations.

## Out Of Scope

- Changing runtime behavior, Vercel settings, billing settings, or Supabase
  configuration in this documentation task.
- Implementing any remediation task from ND-367 through ND-375.
- Promoting or rolling back a deployment.

## Prerequisites And Runtime Assumptions

- The user upgraded `dorian-agaesses-projects` to Vercel Pro on 2026-09-01.
- Live Vercel telemetry was inspected read-only for the latest 30-day,
  seven-day, daily, route, region, and Production/Preview views.
- Nexus Dash agent credentials provide project/task read and write scopes; the
  deployed production API currently uses the full-board reorder operation for
  status changes.

## Deployment And Review Assumptions

- Work occurs on `docs/nd-366-vercel-fluid-compute-decision` from
  `origin/main` with one documentation PR.
- No Preview deployment is required because runtime behavior is unchanged.
- Open the PR ready for review, wait for the initial Copilot outcome, and
  address actionable feedback before handoff.

## Acceptance Criteria

1. `adr/decisions.md` records the context, measured baseline, accepted
   architecture, tradeoffs, target thresholds, and rejected immediate options.
2. Nexus Dash contains one dedicated epic and an executable task sequence for
   spend controls, transport mitigation, observability, Supabase Realtime,
   legacy retirement, and post-remediation review.
3. Tasks include acceptance criteria and definitions of done and are linked to
   the epic and their direct implementation relationships.
4. The documentation distinguishes the Pro upgrade's continuity value from the
   required engineering remediation.

## Definition Of Done

- Documentation formatting and repository diff checks pass.
- The epic and ND-366 through ND-375 are verified through the agent API.
- `journal.md` records the investigation outcome and planning artifacts.
- A ready PR is open, required checks pass, Copilot review completes, and every
  actionable review thread is addressed.

## References

- Nexus Dash epic `Realtime Efficiency and Vercel Cost Control`
- Nexus Dash tasks `ND-366` through `ND-375`
- `adr/decisions.md`
- `app/api/account/notifications/stream/route.ts`
- `app/api/projects/[projectId]/activity/stream/route.ts`
- `components/notification-live-updates.tsx`
- `components/project-live-refresh.tsx`
