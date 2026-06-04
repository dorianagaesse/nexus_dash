# Current Task: TASK-312 Hidden Project Refresh Reconciliation

## Task ID
TASK-312

## Status
Implemented on `feature/task-312-hide-project-refresh-affordance`; PR workflow
in progress.

## Source
- User feedback after TASK-311: the bottom-right "Project updates are ready /
  Refresh" button exposes internal synchronization machinery and adds
  unnecessary product noise.

## Objective
Keep the live project reconciliation safety fallback, but make it invisible to
users. Remote updates may still be deferred while a user is actively editing or
the tab is hidden, then auto-apply as soon as the dashboard is safe to refresh.

## Why This Matters
NexusDash should feel collaborative and automatic. A visible manual refresh
control suggests the user must understand or operate the realtime system, even
though the app already has enough state to apply pending updates safely once
editing locks clear.

## Scope
- Remove the rendered project-refresh prompt and manual refresh button from
  `ProjectLiveRefresh`.
- Preserve hidden pending-version tracking and automatic refresh once locks,
  hidden-tab state, or in-flight refresh state clear.
- Update component tests so they assert silent deferral and automatic follow-up
  refresh behavior.
- Mark TASK-311 complete in backlog tracking now that PR #318 is merged.

## Out Of Scope
- Changing the typed realtime event contract from TASK-311.
- Replacing the SSE/fallback transport.
- Notification-center realtime behavior; TASK-263 remains the dedicated task.

## Acceptance Criteria
1. Users never see the bottom-right project refresh prompt or refresh button.
2. Remote updates that cannot be applied immediately remain pending internally.
3. Pending updates still auto-refresh when the dashboard becomes safe.
4. Existing typed-event patching and fallback-refresh behavior remain covered by
   tests.

## Definition Of Done
- [x] `ProjectLiveRefresh` no longer renders user-facing pending-refresh UI.
- [x] Focused tests cover invisible deferral and automatic pending refresh.
- [x] `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- [ ] PR is opened, checks pass, Copilot feedback is handled, and the PR is
      merged.

## Validation Evidence
- `npm test -- --run tests/components/project-live-refresh.test.tsx` passed 1
  file / 10 tests.
- `npm run lint` passed.
- Local PostgreSQL env `npm test` passed: 116 files passed, 2 skipped; 866
  tests passed, 2 skipped.
- Local PostgreSQL env `npm run test:coverage` passed with 91.37% statements,
  81.33% branches, 92.2% functions, and 91.88% lines.
- Local-safe production env `npm run build` passed.
- Local-safe production env `npm run test:e2e` passed 8/8 Playwright specs
  after providing the expected `NEXTAUTH_URL`/`NEXTAUTH_SECRET` and trusted
  local origins for the password-reset flow.
