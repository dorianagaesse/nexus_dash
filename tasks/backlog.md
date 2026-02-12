# Backlog

Use this file to capture tasks discovered during development. Each entry should include: ID, title, rationale, dependencies.

## Tasks
- ID: TASK-010
  Title: Task creation UX polish (modal close behavior + placement of \"+ New task\")
  Rationale: Keep board compact by auto-closing create modal on submit, supporting outside-click close, and placing the trigger top-left under \"Kanban board\" to reserve right-side area for project context.
  Dependencies: TASK-008
- ID: TASK-011
  Title: App theming (light/dark mode toggle with persistence)
  Rationale: Dark-only UI is not suitable in all lighting conditions; users need an accessible bright mode.
  Dependencies: TASK-003
- ID: TASK-012
  Title: Home page refinement (projects-first + create-project modal)
  Rationale: Prioritize visibility of current projects and align project creation UX with task creation modal behavior, including outside-click close.
  Dependencies: TASK-002
- ID: TASK-004
  Title: Project context panel with user-defined info cards
  Rationale: Each project needs lightweight contextual information above Kanban that users can add/edit quickly.
  Dependencies: TASK-010
- ID: TASK-005
  Title: Google auth and calendar integration
  Rationale: Enables calendar events visibility directly in NexusDash.
  Dependencies: TASK-004
- ID: TASK-006
  Title: Full validation suite after refinement pass
  Rationale: Validate project/task/theming/home flows end-to-end after UX refinements to avoid hidden regressions.
  Dependencies: TASK-004, TASK-011, TASK-012
- ID: TASK-007
  Title: Extend project context cards with optional document attachments/links
  Rationale: Preserves original resource panel intent while building on user-defined info cards model.
  Dependencies: TASK-004
