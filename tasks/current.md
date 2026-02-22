# Current Task: TASK-077 Mutation/Upload UX Smoothing - Global Toast Queue and Finite Feedback

## Task ID
TASK-077

## Status
In Review (PR #46, checks pass) (2026-02-22)

## Objective
Replace long-lived inline mutation/upload status lines with a global stacked toast system so feedback is clear, short-lived, and consistent across task/context-card/attachment flows.

## Why Now
- Current UI still shows persistent background status text that can become stale.
- Recent interaction improvements (TASK-078) need matching feedback ergonomics.
- Users need quick success/failure confirmation without requiring panel refreshes or hunting for status text.

## Scope
- Create a shared global toast queue system:
  - FIFO stacking behavior.
  - Auto-dismiss (default 4 seconds).
  - Distinct visual treatment for success and error toasts.
  - Manual close affordance.
- Replace persistent inline mutation/upload status text in:
  - task create flow
  - context-card create/update/delete flow
  - task update/delete flow
  - task/context attachment add/delete flows
- Ensure toast coverage explicitly includes:
  - task created / updated / deleted
  - card created / updated / deleted
  - attachment uploaded / deleted
  - upload/mutation failures

## Out of Scope
- New auth/authz behavior.
- Multi-user ownership changes (TASK-076).
- Structural redesign of modal layouts beyond status feedback replacement.

## Acceptance Criteria
- No persistent inline `creating...`, `saving...`, or upload progress text blocks remain in dashboard panels/modals.
- Toasts appear for mutation/upload success and failure states.
- Multiple rapid events queue and dismiss in FIFO order.
- Delete operations surface explicit success/failure toasts (task/card/attachment).
- Toast system is reusable and not duplicated per panel.
- Lint/tests/build remain green.

## Definition of Done
- Implementation is delivered in a dedicated TASK-077 PR.
- Copilot review comments are answered directly and resolved.
- PR checks are green after final push.
- `tasks/current.md` and `tasks/backlog.md` reflect task progression accurately.

## Implementation Notes
- Keep toast API minimal (`push`, `dismiss`) and framework-native (React context + hook).
- Prefer small integration points in existing mutation handlers over broad refactors.

---

Last Updated: 2026-02-22
Assigned To: User + Agent
