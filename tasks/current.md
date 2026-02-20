# Current Task: Modern Authentication/Authorization ADR

## Task ID
TASK-020

## Status
In Progress (2026-02-20)

## Summary
Define the authoritative auth/authz architecture for NexusDash before implementation phases, with explicit decisions for user sessions, project ownership/membership, non-human access, and future public API exposure.

## Acceptance Criteria
- A detailed ADR is drafted and stored in `adr/task-020-modern-auth-authorization-adr.md`.
- ADR defines:
  - identity/session model for users (DB-backed sessions, lifecycle controls),
  - authorization model for projects (ownership + role-based membership),
  - agent access model (API key credentials + scoped short-lived JWT runtime tokens),
  - stateless-server strategy (DB authority + optional Redis session cache),
  - migration plan for existing data and Google calendar credential scoping.
- ADR includes a concrete roadmap mapping to TASK-045/TASK-046/TASK-047/TASK-058/TASK-059/TASK-048.
- `tasks/backlog.md`, `tasks/current.md`, and `adr/decisions.md` are aligned with TASK-020 progress.

## Definition of Done
- ADR reviewed for internal consistency and implementation readiness.
- `TASK-020` remains in review/proposed state until explicit acceptance.
- Follow-up tasks and boundaries are unambiguous enough to implement without architectural guesswork.

## Required Input
No blocking input required for ADR drafting. Acceptance status can be confirmed after review.

## Next Step
Review and approve ADR decisions, then start TASK-045 (auth data model + migration) with the ADR as source of truth.

---

Last Updated: 2026-02-20
Assigned To: User + Agent
