# Current Task: TASK-308 Smart Live Project Refresh

## Task ID
TASK-308

## Status
In progress on `feature/task-308-smart-live-refresh`.

## Source
- User request on 2026-05-31 after TASK-276 / PR #314:
  the bottom-right project refresh affordance should not become routine friction
  for collaboration; remote updates should arrive automatically when safe, and
  local/self-originated changes should not ask the user to refresh their own
  work.
- Backlog entry: `tasks/backlog.md` / TASK-308.

## Objective
Improve the TASK-118 live project refresh layer so project dashboard
collaboration feels automatic and interruption-aware: local mutations are
acknowledged by the active tab, remote collaborator or agent updates refresh the
dashboard when the user is idle, and the manual refresh prompt appears only as a
safety affordance while editing or modal state could be disrupted.

## Scope
- Keep the existing lightweight activity endpoint and polling fallback.
- Add a small client-side project activity acknowledgement contract for
  successful local mutations.
- Make the live refresh controller auto-apply deferred remote updates as soon as
  the refresh lock clears, without requiring a focus change or manual click.
- Wire acknowledgement into high-frequency project dashboard mutations covered
  by TASK-276: task create/update/reorder/delete/archive, comment create,
  context-card create/update/delete, and comparable local-first flows.
- Preserve editing safety: dialogs, focused inputs, contenteditable surfaces, and
  explicit project live-refresh locks still defer route refresh.
- Add focused tests for local acknowledgement, automatic refresh, and deferred
  refresh behavior.

## Acceptance Criteria
1. A successful local project mutation advances/acknowledges the live-refresh
   version for the active tab so the bottom-right refresh prompt is not shown
   for the user's own saved action.
2. A remote activity version newer than the known local version triggers
   `router.refresh()` automatically when no refresh lock is active.
3. If a remote update arrives while a form, modal, contenteditable, or explicit
   live-refresh lock is active, the prompt is shown as a safety affordance.
4. Once that lock clears, the pending remote update is applied automatically
   without requiring the user to switch tabs, focus the window, or click Refresh.
5. The live-refresh contract remains compatible with project-scoped agent
   polling via `/api/projects/:projectId/activity`.
6. Focused automated tests cover the new acknowledgement and lock-release
   behavior.

## Definition Of Done
- [x] Implementation is committed on the dedicated feature branch.
- [x] Focused tests cover the live-refresh controller and client
      acknowledgement behavior.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
      pass.
- [x] UI-impacting behavior is smoke-tested with Playwright locally or against a
      branch preview.
- [x] `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- [ ] A ready-for-review PR is opened, automated checks pass, and Copilot review
      feedback is handled.

## Notes
- TASK-276 removed many success-path route refreshes and made local mutation
  feedback immediate. TASK-308 builds on that by keeping the cross-tab/project
  activity watcher from treating those local writes as unknown remote changes.
- The current transport is intentionally still polling-based. A future realtime
  transport can reuse the same acknowledgement semantics.
