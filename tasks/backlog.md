# Backlog

Use this file to capture tasks discovered during development. Each entry should include: ID, title, rationale, dependencies.

## Pending
- ID: TASK-005
  Title: Google auth and calendar integration
  Status: Pending
  Rationale: Enables calendar events visibility directly in NexusDash.
  Dependencies: TASK-004
- ID: TASK-022
  Title: Production deployment baseline (runtime, CI/CD, secrets, observability)
  Status: Pending
  Rationale: Move from local Docker setup to reproducible deployment with modern operational best practices, initially restricted to allowed source IPs.
  Dependencies: TASK-019
- ID: TASK-020
  Title: Authentication/session architecture ADR (account creation, session persistence, token model)
  Status: Pending
  Rationale: Define secure, modern auth/session model with explicit JWT vs server-stored session tradeoffs and MFA/passkey roadmap.
  Dependencies: TASK-022
- ID: TASK-021
  Title: Implement production-grade authentication and account onboarding
  Status: Pending
  Rationale: Add user accounts, persistent sessions, and modern authentication UX aligned with architecture decision.
  Dependencies: TASK-020
- ID: TASK-006
  Title: Full validation suite after refinement pass
  Status: Pending
  Rationale: Validate project/task/theming/home flows end-to-end after UX refinements to avoid hidden regressions.
  Dependencies: TASK-004, TASK-011, TASK-012, TASK-019
- ID: TASK-023
  Title: Security assessment and remediation baseline
  Status: Pending
  Rationale: Perform structured security review (OWASP-focused) and implement high-priority mitigations before broader rollout.
  Dependencies: TASK-021, TASK-022

## Completed
- ID: TASK-004
  Title: Project context panel with user-defined info cards
  Status: Done (2026-02-12)
  Rationale: Each project needs lightweight contextual information above Kanban that users can add/edit quickly.
  Dependencies: TASK-010
- ID: TASK-010
  Title: Task creation UX polish (modal close behavior + placement of "+ New task")
  Status: Done (2026-02-12)
  Rationale: Keep board compact by auto-closing create modal on submit, supporting outside-click close, and placing the trigger top-left under "Kanban board" to reserve right-side area for project context.
  Dependencies: TASK-008
- ID: TASK-011
  Title: App theming (light/dark mode toggle with persistence)
  Status: Done (2026-02-12)
  Rationale: Dark-only UI is not suitable in all lighting conditions; users need an accessible bright mode.
  Dependencies: TASK-003
- ID: TASK-012
  Title: Home page refinement (projects-first + create-project modal)
  Status: Done (2026-02-12)
  Rationale: Prioritize visibility of current projects and align project creation UX with task creation modal behavior, including outside-click close.
  Dependencies: TASK-002
- ID: TASK-013
  Title: Simplify Kanban column containers by removing dashed task-area borders
  Status: Done (2026-02-12)
  Rationale: Reduce visual noise inside columns and improve readability of task cards.
  Dependencies: TASK-003
- ID: TASK-014
  Title: Move task edit action to top-right icon near modal close control
  Status: Done (2026-02-12)
  Rationale: Keep task detail modal actions compact and aligned with expected edit affordances.
  Dependencies: TASK-009
- ID: TASK-015
  Title: Show blocked-state warning icon on tasks in Blocked column
  Status: Done (2026-02-12)
  Rationale: Blocked items should be immediately visible at scan-time without opening details.
  Dependencies: TASK-003
- ID: TASK-016
  Title: Add editable warning follow-up section for blocked task details
  Status: Done (2026-02-12)
  Rationale: Teams need a dedicated place to capture blocker context and follow-up notes when expanding blocked tasks.
  Dependencies: TASK-009
- ID: TASK-017
  Title: Auto-archive old Done tasks with Done-column archive dropdown
  Status: Done (2026-02-12)
  Rationale: Keep Done column focused by moving tasks older than 7 days into an archive list accessible from Done.
  Dependencies: TASK-003
- ID: TASK-007
  Title: Extend project context cards with optional document attachments/links
  Status: Done (2026-02-12)
  Rationale: Preserves original resource panel intent while building on user-defined info cards model.
  Dependencies: TASK-004
- ID: TASK-018
  Title: Task attachment architecture ADR (external links + file storage strategy)
  Status: Done (2026-02-12)
  Rationale: Task-level attachments need a clear storage strategy before implementation (local volume vs DB blobs vs object storage with signed URLs).
  Dependencies: TASK-007
- ID: TASK-019
  Title: Task attachments MVP (add links and file attachments per task)
  Status: Done (2026-02-12)
  Rationale: Users need to attach contextual URLs and files directly to tasks for execution continuity.
  Dependencies: TASK-018
- ID: TASK-024
  Title: Persist dashboard section expand/collapse state in localStorage
  Status: Done (2026-02-12)
  Rationale: Keep Project context and Kanban board in the user's preferred expanded/collapsed state across refreshes for smoother daily usage.
  Dependencies: TASK-004
