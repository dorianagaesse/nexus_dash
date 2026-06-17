# Current Task: TASK-314 Agent Access Settings Loading And Overflow

## Task ID
TASK-314

## Status
In Progress

## Source
- GitHub issue #312: Fix agent access settings credential load delay and
  overflow scrollbars.

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
- [ ] Agent-access summary prefetch and loading UI are implemented.
- [ ] Modal and panel width containment is implemented.
- [ ] Regression tests cover loading and overflow-sensitive rendering.
- [ ] Product version and changelog follow the release policy.
- [ ] Required local and preview validation passes.
- [ ] A ready-for-review PR is open and Copilot feedback is handled.
