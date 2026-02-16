# Backlog

Use this file to capture tasks discovered during development. Each entry should include: ID, title, rationale, dependencies.

## Pending
- ID: TASK-036
  Title: Validation suite phase 1 - API regression contracts
  Status: Pending
  Rationale: Extend route-level contract tests to core project/task/attachment/auth endpoints to protect behavior before infra/auth changes.
  Dependencies: TASK-034
- ID: TASK-037
  Title: Validation suite phase 2 - critical UI/E2E smoke flows
  Status: Pending
  Rationale: Cover top-value journeys (project creation, task lifecycle, attachment interactions, calendar interactions) to catch integration regressions not visible from API tests alone.
  Dependencies: TASK-036
- ID: TASK-038
  Title: Validation suite phase 3 - CI quality gates
  Status: Pending
  Rationale: Enforce automated quality gates (lint/test/coverage) in CI so validation remains stable over time.
  Dependencies: TASK-036, TASK-037
- ID: TASK-039
  Title: Deployment baseline phase 1 - runtime target and network allowlist
  Status: Pending
  Rationale: Define production runtime target and ingress policy (including source-IP restrictions) before pipeline implementation.
  Dependencies: TASK-019
- ID: TASK-040
  Title: Deployment baseline phase 2 - secrets and configuration management
  Status: Pending
  Rationale: Introduce a secure, reproducible config/secrets model for all environments to avoid credential drift and accidental exposure.
  Dependencies: TASK-039
- ID: TASK-041
  Title: Deployment baseline phase 3 - CI pipeline for build/test/image
  Status: Pending
  Rationale: Add a reproducible CI pipeline that validates code and artifacts before deployment.
  Dependencies: TASK-040
- ID: TASK-042
  Title: Deployment baseline phase 4 - CD deployment and rollback strategy
  Status: Pending
  Rationale: Enable controlled releases with rollback to reduce operational risk during production changes.
  Dependencies: TASK-041
- ID: TASK-043
  Title: Deployment baseline phase 5 - observability minimum viable stack
  Status: Pending
  Rationale: Add logs, health checks, and error visibility so production issues are detectable and diagnosable.
  Dependencies: TASK-039
- ID: TASK-020
  Title: Modern authentication/authorization ADR (user ownership, sharing, agent access, session model)
  Status: Pending
  Rationale: Define a state-of-the-art authz/authn model covering user-owned projects, shareable collaboration, secure agent access, and persistent web sessions without repeated login prompts.
  Dependencies: TASK-035, TASK-039, TASK-040, TASK-057
- ID: TASK-045
  Title: Authentication implementation phase 1 - user/session data model and migrations
  Status: Pending
  Rationale: Establish durable auth persistence primitives before middleware/UI implementation.
  Dependencies: TASK-020, TASK-057
- ID: TASK-046
  Title: Authentication implementation phase 2 - auth core and route protection
  Status: Pending
  Rationale: Implement login/session lifecycle and protect project/task APIs and pages behind authenticated access.
  Dependencies: TASK-045
- ID: TASK-047
  Title: Authentication implementation phase 3 - account onboarding UX
  Status: Pending
  Rationale: Add account creation and onboarding flows aligned with the approved auth architecture.
  Dependencies: TASK-046
- ID: TASK-048
  Title: Authentication implementation phase 4 - auth tests and hardening
  Status: Pending
  Rationale: Validate auth behavior and edge cases with automated tests before security remediation pass.
  Dependencies: TASK-046, TASK-047, TASK-058, TASK-059
- ID: TASK-058
  Title: Authorization implementation - project sharing, membership roles, and invitations
  Status: Pending
  Rationale: Support collaborative usage by introducing project-level membership (owner/editor/viewer), secure sharing/invite flows, and permission checks across UI and APIs.
  Dependencies: TASK-046, TASK-047
- ID: TASK-059
  Title: Agent access implementation - scoped API tokens, rotation, and audit trail
  Status: Pending
  Rationale: Enable secure non-human access via revocable scoped tokens/service principals so agents can operate on authorized projects without sharing user sessions.
  Dependencies: TASK-046
- ID: TASK-049
  Title: Security baseline phase 1 - OWASP-focused assessment and threat model
  Status: Pending
  Rationale: Perform a structured review of attack surface and rank risks by impact/likelihood to guide remediation scope.
  Dependencies: TASK-020, TASK-039
- ID: TASK-050
  Title: Security baseline phase 2 - high-priority remediation sprint
  Status: Pending
  Rationale: Implement mitigations for top-ranked findings discovered in the security assessment.
  Dependencies: TASK-048, TASK-049, TASK-043
- ID: TASK-051
  Title: Security baseline phase 3 - verification, retest, and closure report
  Status: Pending
  Rationale: Confirm remediation effectiveness and document residual risk with explicit follow-up items.
  Dependencies: TASK-050
- ID: TASK-006
  Title: Full validation suite after refinement pass
  Status: Pending (Epic - split into TASK-036/TASK-037/TASK-038)
  Rationale: Validate project/task/theming/home flows end-to-end after UX refinements to avoid hidden regressions.
  Dependencies: TASK-038
- ID: TASK-022
  Title: Production deployment baseline (runtime, CI/CD, secrets, observability)
  Status: Pending (Epic - split into TASK-039/TASK-040/TASK-041/TASK-042/TASK-043)
  Rationale: Move from local Docker setup to reproducible deployment with modern operational best practices, initially restricted to allowed source IPs.
  Dependencies: TASK-042, TASK-043
- ID: TASK-021
  Title: Implement production-grade authentication and account onboarding
  Status: Pending (Epic - split into TASK-045/TASK-046/TASK-047/TASK-048/TASK-058/TASK-059)
  Rationale: Add user accounts, persistent sessions, and modern authentication UX aligned with architecture decision.
  Dependencies: TASK-048, TASK-058, TASK-059
- ID: TASK-023
  Title: Security assessment and remediation baseline
  Status: Pending (Epic - split into TASK-049/TASK-050/TASK-051)
  Rationale: Perform structured security review (OWASP-focused) and implement high-priority mitigations before broader rollout.
  Dependencies: TASK-051

## Completed
- ID: TASK-057
  Title: Database migration phase 1 - SQLite to PostgreSQL parity migration
  Status: Done (2026-02-15)
  Rationale: Switched Prisma datasource to PostgreSQL with repository-owned baseline migration, archived legacy SQLite migrations for traceability, and validated runtime/build/test/docker flows against Supabase-backed configuration without introducing auth/user model changes.
  Dependencies: TASK-056, TASK-055
- ID: TASK-056
  Title: Data platform ADR - PostgreSQL baseline and Supabase fit assessment
  Status: Done (2026-02-15)
  Rationale: Selected PostgreSQL as the persistence baseline and Supabase-managed Postgres as the default hosting target, with explicit guardrails to keep Prisma schema/migrations provider-agnostic and avoid premature platform coupling.
  Dependencies: TASK-035
- ID: TASK-055
  Title: Boundary refactor phase 3 - unify mutation boundaries across server actions and API routes
  Status: Done (2026-02-15)
  Rationale: Standardized project/task/context-card create/update/delete mutations on API routes and removed legacy project server-action mutation file; client mutation UI now targets one boundary contract per use case.
  Dependencies: TASK-053, TASK-054
- ID: TASK-054
  Title: Boundary refactor phase 2 - decompose oversized client panels into modules/hooks
  Status: Done (2026-02-15)
  Rationale: Extracted panel-specific utility modules (kanban/context/calendar), split calendar date-time picker into a dedicated component, and introduced a shared project-section expansion hook used across Kanban, Context, and Calendar panels.
  Dependencies: TASK-053
- ID: TASK-053
  Title: Boundary refactor phase 1 - extract backend application service layer
  Status: Done (2026-02-15)
  Rationale: Extracted shared backend service modules for task/context-card/attachment/calendar flows and converted server actions plus API routes into thin adapters with preserved response contracts.
  Dependencies: TASK-035
- ID: TASK-052
  Title: Git governance baseline (protected main + short-lived branch workflow + PR gates)
  Status: Done (2026-02-15)
  Rationale: Governance workflow is defined and documented in-repo (`agent.md` + workflow checks); GitHub protection enforcement is queued for repo-public milestone.
  Dependencies: TASK-035
- ID: TASK-035
  Title: Architecture audit baseline (system boundaries, risks, and technical debt)
  Status: Done (2026-02-15)
  Rationale: Produced a concrete architecture snapshot and risk assessment, then aligned on targeted medium boundary refactor + staged PostgreSQL migration + modern auth/share/agent roadmap.
  Dependencies: TASK-034
- ID: TASK-034
  Title: API route integration tests and coverage expansion
  Status: Done (2026-02-13)
  Rationale: Validate real request/response contracts and error mapping across API routes to catch regressions that unit tests alone may miss.
  Dependencies: TASK-028
- ID: TASK-028
  Title: Test writing and coverage
  Status: Done (2026-02-13)
  Rationale: Establish automated tests and measurable coverage to prevent regressions across core workflows.
  Dependencies: TASK-026
- ID: TASK-033
  Title: Attachment workflow fluidity on create/edit
  Status: Done (2026-02-13)
  Rationale: Allow Enter-to-add for link attachments and keep create/edit modal open so users can add multiple attachments in one flow.
  Dependencies: TASK-026, TASK-027
- ID: TASK-032
  Title: Calendar event creation and edit
  Status: Done (2026-02-13)
  Rationale: Extend current read-only calendar integration so events can be created and edited directly from NexusDash.
  Dependencies: TASK-005
- ID: TASK-005
  Title: Google auth and calendar integration
  Status: Done (2026-02-13)
  Rationale: Enables calendar events visibility directly in NexusDash.
  Dependencies: TASK-004
- ID: TASK-029
  Title: File preview for attachment files (image, PDF)
  Status: Done (2026-02-13)
  Rationale: Allow quick in-app preview for supported file types without forcing immediate download.
  Dependencies: TASK-019
- ID: TASK-030
  Title: Traceable blocked follow-up timeline on Kanban cards
  Status: Done (2026-02-13)
  Rationale: Make blocked follow-up auditable by storing append-only updates where each entry shows its creation date/time.
  Dependencies: TASK-016
- ID: TASK-031
  Title: Multi-label Kanban card creation with Enter-to-add and autocomplete
  Status: Done (2026-02-13)
  Rationale: Improve task labeling by supporting multiple labels, Enter-to-add interactions, pastel auto-colors, and suggestions from existing labels.
  Dependencies: TASK-003, TASK-010
- ID: TASK-027
  Title: Attachment UI refinement with minimalist action icons
  Status: Done (2026-02-13)
  Rationale: Simplify attachment zones by using compact icon-first controls for link and file actions.
  Dependencies: TASK-026
- ID: TASK-025
  Title: Auto-close create-project modal on successful submit
  Status: Done (2026-02-13)
  Rationale: Keep create flow consistent with other modals by closing immediately after submission.
  Dependencies: TASK-012
- ID: TASK-026
  Title: Enable attachments during task/context card creation
  Status: Done (2026-02-13)
  Rationale: Attachment support should be available at creation-time, not only after opening edit mode.
  Dependencies: TASK-007, TASK-019
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
