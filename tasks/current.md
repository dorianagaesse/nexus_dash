# Current Task

## Task

- ID: TASK-349
- Title: Bilateral related-task relationships
- Status: In progress (2026-07-30)
- Branch: `fix/395-bilateral-task-relations`
- GitHub issue: [#395](https://github.com/dorianagaesse/nexus_dash/issues/395)
- Brief: [`task-349-bilateral-related-task-relationships.md`](./task-349-bilateral-related-task-relationships.md)

## Objective

Make the existing canonical task relationship visible and consistent from both
task directions after local mutations, live project updates, and full reloads.

## Scope

- Preserve the single canonical `leftTaskId`/`rightTaskId` database row.
- Verify task mutation and project-list responses merge incoming and outgoing
  relationships.
- Reconcile add, replace, and remove operations across every loaded active and
  archived task, including the currently selected task.
- Apply the same bilateral reconciliation to remote project activity updates.
- Add focused service/API, client reconciliation, and browser regression
  coverage without redesigning the related-task picker.

## Runtime Assumptions

- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- No Prisma model or migration change is expected because `TaskRelation`
  already stores one canonical undirected pair.
- Browser validation uses the existing Playwright project/task fixture and may
  run locally or against a branch preview.
- A preview deployment, if used, must pass
  `git_ref=fix/395-bilateral-task-relations` explicitly.

## Acceptance Criteria

1. Relating task A to task B makes B visible from A and A visible from B
   immediately after save and after a full reload.
2. Removing the relation from either task removes it from both loaded task
   views immediately and remains removed after reload.
3. Repeated saves and duplicate input IDs keep one logical relation and one UI
   entry.
4. Local mutation and remote project-activity reconciliation update every
   affected active or archived task without requiring a broad refresh.
5. Existing archived-task visibility, project authorization, and cross-project
   validation rules remain unchanged.
6. Focused service/API, client reconciliation, and Playwright regression
   coverage passes.
7. Task tracking, root-cause notes, validation evidence, and release metadata
   are updated in the same pull request.

## Definition Of Done

- The root cause is documented with immediate-state and reload behavior.
- The fix uses the established service boundary and canonical relation model.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and the relevant Playwright coverage pass.
- The patch version, changelog, task/backlog tracking, and journal are updated.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.

## Outcome

- Preserved the canonical undirected database row and existing tenant
  boundaries.
- Centralized incoming/outgoing serialization into one sorted, duplicate-safe
  mapper used by server-rendered, list API, and mutation response paths.
- Reconciled authoritative local and remote mutations across both task
  directions in active, archived, and selected client state.
- Added focused mapping, API, reconciliation, and browser coverage for add,
  remove, repeat-save, immediate-state, and reload behavior.
- Prepared patch release `v0.31.1`.

## Validation

- `npm run lint` passed.
- `npm run rls:check` passed.
- `npm run release:check -- --base origin/main --branch fix/395-bilateral-task-relations`
  and `git diff --check` passed.
- `npm test`: 985 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with local PostgreSQL and documented preview-safe
  environment overrides.
- Focused Playwright regression passed, followed by the complete 28-scenario
  Playwright suite.
