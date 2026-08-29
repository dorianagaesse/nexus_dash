# Current Task

## TASK-379: Agent credential presets for read/write access without delete

## Status

In progress on `feature/task-379-credential-presets` (worktree
`../nexus_dash_task379`, from current `origin/main`).

## Context

Issuing a project-scoped agent credential today means ticking ten raw
scope checkboxes, and onboarding examples (including the hosted smoke
test) end with a task deletion, steering agents toward destructive
permissions they usually do not need. The underlying write/delete scope
split already exists and is enforced, so this task is about making the
non-destructive choice the easy, default path: presets in the credential
form, preset-aware guidance, and onboarding examples that do not grant or
exercise `task:delete`.

## Scope

- Add `AGENT_CREDENTIAL_PRESETS` to `lib/agent-access.ts` with
  validated scope arrays and guidance copy, including:
  - "Read only" → `["project:read", "task:read"]`
  - "Read + write (no delete)" → `["project:read", "task:read", "task:write"]` (recommended)
  - "Full access" → read/write plus `task:delete` (kept for completeness;
    copy steers away unless destruction is required)
- Preset chips above the scope checkbox grid in the credential panel;
  selecting a preset fills the scope selection, and new credential forms
  start with the non-destructive preset pre-selected. Raw checkboxes stay
  for advanced editing.
- Update onboarding guidance: the guide's scope-model card explains the
  presets and the prefer-no-delete rule; the hosted smoke-test example
  ends with a non-destructive status transition instead of a task DELETE.
- No backend changes: the write/delete split is already enforced at the
  service layer.

## Acceptance Criteria

1. The credential form offers one-click presets that set exactly the
   documented scope arrays, with the non-destructive read/write preset
   selected by default for new credentials.
2. Presets only ever produce valid, vocabulary-ordered scopes accepted by
   the existing credential service.
3. Onboarding docs and the smoke-test example no longer instruct agents to
   grant or use `task:delete` for routine task work, and explain the
   read/write-without-delete recommendation.
4. Credential creation, rotation, and revocation behavior is unchanged.

## Definition Of Done

- Component tests cover preset application and default pre-selection;
  lib tests validate preset definitions against the scope vocabulary.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump and CHANGELOG entry.
- `npm run test:e2e` passes (UI flow touched) against the local PostgreSQL
  baseline.
- A ready-for-review PR is open against `origin/main`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- TASK-331 (capability vocabulary) remains pending; presets use the
  existing scope vocabulary and stay compatible with it.
