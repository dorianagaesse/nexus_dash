# Current Task: TASK-317 Agent Access Settings Loading And Overflow

## Task ID
TASK-317

## Status
Complete once PR #332 merges.

## Source
- GitHub issue #312: Fix agent access settings credential load delay and
  overflow scrollbars.
- Originally tracked as TASK-314 before PR #331 independently assigned that ID
  to meeting-todo overdue reminders.

## Objective
Make the Project settings Agent access tab feel immediate and remain contained
inside the settings modal when credentials, audit events, and long quickstart
values render.

## Scope
- Prefetch the owner agent-access summary when Project settings opens.
- Show an explicit credential loading state immediately while the first summary
  request is pending.
- Contain long credential metadata, request paths, and quickstart values without
  widening the settings modal.
- Preserve credential creation, rotation, revocation, token exchange, and audit
  behavior.

## Acceptance Criteria
1. Opening Project settings starts loading agent-access data before the Agent
   access tab is selected.
2. The Agent access tab shows an explicit initial loading state while data is
   pending.
3. Existing credentials, public IDs, audit paths, and quickstart values cannot
   force modal-level horizontal overflow.
4. Vertical scrolling remains contained in the settings content area.
5. Credential lifecycle and authorization behavior remain unchanged.
6. Relevant component tests, lint, unit/API tests, coverage, build, and UI
   validation pass.

## Definition Of Done
- [x] Agent-access summary prefetch and loading UI are implemented.
- [x] Modal and panel width containment is implemented.
- [x] Regression tests cover loading and overflow-sensitive rendering.
- [x] Product version and changelog follow the release policy.
- [x] Required local and preview validation passes.
- [x] A ready-for-review PR is open and Copilot feedback is handled.
