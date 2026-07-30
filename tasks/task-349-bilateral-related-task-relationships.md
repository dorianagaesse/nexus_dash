# TASK-349 - Bilateral related-task relationships

## Status

In review (2026-07-30, PR #399)

## Objective

Fix GitHub issue #395 so one canonical task relationship behaves as an
undirected relationship everywhere it is read or reconciled.

## Root-Cause Investigation

- Persistence already deletes both pair directions and recreates one canonical
  `leftTaskId`/`rightTaskId` row with duplicate skipping.
- Server project-list and mutation payloads already select both
  `incomingRelations` and `outgoingRelations`, so a full reload reconstructs
  both directions.
- The local task-update path replaces only the task that was saved. It does not
  add or remove the inverse summary on the other loaded task.
- Remote task activity similarly upserts only the changed task, leaving inverse
  references stale for collaborators until a broad project refresh.

## Scope

- Add a focused, reusable client reconciliation primitive for authoritative
  related-task updates.
- Apply it to local saves and remote activity upserts across active, archived,
  and selected task state.
- Strengthen bilateral response and duplicate-regression coverage.
- Add a browser regression for immediate and reload behavior.

## Out Of Scope

- Picker layout or candidate-list redesign.
- User-facing task identifiers.
- Cross-project relationships.
- Blocked follow-up behavior.
- Prisma schema or migration changes.

## Acceptance Criteria

1. Adding B from A immediately exposes A from B and survives reload.
2. Removing the relation from either task immediately removes both directions
   and survives reload.
3. Repeated saves do not create duplicate rows or summaries.
4. Active and archived related-task summaries preserve current visibility
   rules.
5. Authorization and same-project validation remain unchanged.
6. Focused service/API, reconciliation, and browser tests pass.

## Definition Of Done

- Root cause and delivered behavior are recorded in this brief and
  `journal.md`.
- Required validation is green.
- Release metadata and `CHANGELOG.md` reflect the user-visible fix.
- The dedicated branch is pushed and a ready-for-review PR is open.

## Outcome

- Kept the existing canonical `TaskRelation` persistence and same-project
  validation unchanged.
- Centralized incoming/outgoing relation serialization into one sorted,
  duplicate-safe mapper used by task list, server-rendered board, and mutation
  payload paths.
- Added a focused client reconciliation primitive that updates the changed
  task plus every inverse reference across active, archived, selected, and
  remote-live state.
- Added API, mapping, reconciliation, and browser regression coverage for
  bilateral add/remove behavior, duplicate prevention, and reload persistence.

## Validation

- Focused Vitest: 42 tests passed across task mapping, create/update API, and
  client reconciliation.
- Focused ESLint passed.
- Production build passed with documented local PostgreSQL and preview-safe
  environment overrides.
- Focused Playwright bilateral add/remove/reload scenario passed against the
  local production build.
- Full repository validation passed: lint, RLS inventory, release policy, 985
  unit/API tests with 2 skipped, coverage at 91.37% statements / 81.33%
  branches / 92.2% functions / 91.88% lines, production build, and all 28
  Playwright scenarios.
- Published implementation commit `5c1b820` and opened ready-for-review PR
  [#399](https://github.com/dorianagaesse/nexus_dash/pull/399).
