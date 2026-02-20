# Backlog

Use this file to capture tasks discovered during development. Each entry should include: ID, title, rationale, dependencies.

## Pending
### Execution Queue (Now / Next)
- ID: TASK-073
  Title: Projects dashboard entry performance - async project list loading and instant shell
  Status: In Progress
  Rationale: Opening dashboard should feel immediate; render shell instantly and fetch project list asynchronously with loading skeletons while avoiding over-eager dynamic prefetch load.
  Dependencies: TASK-039, TASK-042
- ID: TASK-074
  Title: Project page performance - panel-level async loading and progressive hydration
  Status: Pending
  Rationale: Opening a project currently waits on a large server payload; split heavy panel data paths and progressively stream/hydrate to reduce time-to-interactive.
  Dependencies: TASK-073
- ID: TASK-062
  Title: UI decomposition phase - split oversized dashboard components into focused modules
  Status: Pending
  Rationale: Reduce technical debt and SRP violations by decomposing large dashboard components (`kanban-board`, `project-context-panel`, `project-calendar-panel`) into feature-level subcomponents/hooks before auth/security expansion.
  Dependencies: TASK-054, TASK-060
- ID: TASK-020
  Title: Modern authentication/authorization ADR (user ownership, sharing, agent access, session model)
  Status: Pending
  Rationale: Define a state-of-the-art authz/authn model covering user-owned projects, shareable collaboration, secure agent access, and persistent web sessions without repeated login prompts, including explicit signed-out home-page entry behavior (`Sign in`/`Sign up`), DB-backed user sessions, and JWT-style scoped agent/API tokens.
  Dependencies: TASK-035, TASK-039, TASK-040, TASK-057, TASK-060, TASK-062
- ID: TASK-045
  Title: Authentication implementation phase 1 - user/session data model and migrations
  Status: Pending
  Rationale: Establish durable auth persistence primitives (Auth.js/Prisma-compatible user/account/session entities, revocation support, session lifecycle) before middleware/UI implementation.
  Dependencies: TASK-020, TASK-057
- ID: TASK-046
  Title: Authentication implementation phase 2 - auth core and route protection
  Status: Pending
  Rationale: Implement login/session lifecycle and protect project/task APIs and pages behind authenticated access.
  Dependencies: TASK-045
- ID: TASK-047
  Title: Authentication implementation phase 3 - home-page auth entry and account onboarding UX
  Status: Pending
  Rationale: Add signed-out home-page authentication entry points and onboarding flows aligned with the approved auth architecture (email + social provider strategy).
  Dependencies: TASK-046
- ID: TASK-068
  Title: Authentication provider rollout - phase social providers (Google/GitHub) after baseline email auth
  Status: Pending
  Rationale: Keep initial auth delivery focused and stable, then add additional social providers in a controlled phase with consistent consent/callback/session behavior.
  Dependencies: TASK-047
- ID: TASK-058
  Title: Authorization implementation - project sharing, membership roles, and invitations
  Status: Pending
  Rationale: Support collaborative usage by introducing project-level membership (owner/editor/viewer), secure sharing/invite flows, and permission checks across UI and APIs.
  Dependencies: TASK-046, TASK-047
- ID: TASK-059
  Title: Agent access implementation - scoped API tokens, rotation, and audit trail
  Status: Pending
  Rationale: Enable secure non-human access via revocable JWT-style scoped tokens/service principals so agents can operate on authorized projects without sharing user sessions.
  Dependencies: TASK-046
- ID: TASK-048
  Title: Authentication implementation phase 4 - auth tests and hardening
  Status: Pending
  Rationale: Validate auth behavior and edge cases with automated tests before security remediation pass.
  Dependencies: TASK-046, TASK-047, TASK-058, TASK-059
- ID: TASK-061
  Title: Dependency security baseline - vulnerability remediation and scan cadence definition
  Status: Pending
  Rationale: Resolve known high-severity dependency vulnerabilities and define the recurring automated security-scan cadence/policy before production rollout.
  Dependencies: TASK-038
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

### Deferred (Intentional)
- ID: TASK-063
  Title: Background jobs phase 1 - maintenance workload extraction (deferred)
  Status: Pending
  Rationale: Move maintenance writes (for example auto-archive) from request paths to scheduled/background processing after deployment/runtime baseline is in place; defer now to avoid throwaway implementation.
  Dependencies: TASK-039, TASK-043
- ID: TASK-064
  Title: Security hardening - API rate limiting baseline (deferred)
  Status: Pending
  Rationale: Add rate limiting and abuse controls when endpoints are exposed publicly; defer now until deployment/auth topology is finalized so policy matches real traffic boundaries.
  Dependencies: TASK-039, TASK-040, TASK-046

### Epic Tracking (Non-Executable)
- ID: TASK-022
  Title: Production deployment baseline (runtime, CI/CD, secrets, observability)
  Status: Pending (Epic - split into TASK-039/TASK-040/TASK-041/TASK-042/TASK-043)
  Rationale: Move from local Docker setup to reproducible Vercel deployment with modern operational best practices; public exposure requires completed app auth/authz and blob storage migration.
  Dependencies: TASK-042, TASK-043, TASK-048, TASK-058, TASK-065, TASK-066
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
- ID: TASK-072
  Title: Mutation responsiveness pass - reduce blocking waits on create/save interactions
  Status: Done (2026-02-20)
  Rationale: Shifted task/context-card create-save flows to non-blocking UX with background mutation status feedback, plus unmount-safe async guards and accessible live-region announcements.
  Dependencies: TASK-071
- ID: TASK-075
  Title: Context-card attachment parity - direct-to-R2 create flow + shared background uploader
  Status: Done (2026-02-20)
  Rationale: Aligned context-card create with task-create direct R2 strategy, added a shared background upload helper, and standardized provider-aware size validation plus progress feedback.
  Dependencies: TASK-065, TASK-071
- ID: TASK-071
  Title: Smooth upload/creation UX - non-blocking task creation and background attachment uploads
  Status: Done (2026-02-19)
  Rationale: Implemented background R2 uploads for task creation, added progress/error feedback, reduced modal upload blocking, and fixed overlay sizing behavior to prevent top white-bar artifacts.
  Dependencies: TASK-070
- ID: TASK-070
  Title: Attachment uploads phase 2 - direct-to-R2 upload pipeline (serverless-safe)
  Status: Done (2026-02-19)
  Rationale: Eliminated Vercel request-body limits (`413 FUNCTION_PAYLOAD_TOO_LARGE`) by moving file transfer off app API routes to a direct upload flow (pre-signed upload URL + finalize metadata endpoint), with hardened error mapping and modal overlay rendering fixes.
  Dependencies: TASK-065, TASK-069
- ID: TASK-069
  Title: Cloudflare R2 storage validation - end-to-end smoke and deployment readiness
  Status: Done (2026-02-18)
  Rationale: Validated R2-backed attachment lifecycle across task and context-card flows (upload, signed-download redirect mode, delete + DB removal + storage read-miss), and added a gated reproducible smoke test (`R2_SMOKE=1`) for future verification.
  Dependencies: TASK-065, TASK-066
- ID: TASK-067
  Title: Database connection hardening - pooler/direct split, credential hygiene, and runbook
  Status: Done (2026-02-18)
  Rationale: Added production DB runtime guardrails (remote TLS enforcement, pooler/direct endpoint split checks, Supabase endpoint sanity rules), extended env runtime tests for edge cases, and documented credential/rotation runbook.
  Dependencies: TASK-066
- ID: TASK-043
  Title: Deployment baseline phase 5 - observability minimum viable stack
  Status: Done (2026-02-17)
  Rationale: Added liveness/readiness endpoints, request-id propagation middleware, and structured server logging with targeted hardening (request-id validation, metadata Error serialization, bounded upstream error payload logging, readiness timeout) plus regression coverage.
  Dependencies: TASK-042
- ID: TASK-065
  Title: Attachment storage migration - StorageProvider abstraction + Cloudflare R2 object storage
  Status: Done (2026-02-17)
  Rationale: Introduced provider-based attachment storage with local and Cloudflare R2 implementations, signed URL redirect download path, env/docs/test updates, and key uniqueness hardening for concurrent uploads.
  Dependencies: TASK-039, TASK-040
- ID: TASK-066
  Title: Configuration/secrets hardening gate before production rollout
  Status: Done (2026-02-17)
  Rationale: Strengthened startup fail-fast runtime validation, enforced production `DIRECT_URL` requirement, and expanded coverage for env guardrails across auth/storage/database configuration.
  Dependencies: TASK-040
- ID: TASK-042
  Title: Deployment baseline phase 4 - CD deployment and rollback strategy
  Status: Done (2026-02-17)
  Rationale: Added Vercel CLI staged production deploy workflow with manual promote/rollback operations, deployment artifacts, and validation checks.
  Dependencies: TASK-041, TASK-066
- ID: TASK-041
  Title: Deployment baseline phase 3 - CI pipeline for build/test/image
  Status: Done (2026-02-16)
  Rationale: Extended CI with a dedicated container-image gate that runs after quality + E2E checks, validates Docker build reproducibility (`npm ci`), and publishes image metadata artifacts for traceable pre-deploy verification.
  Dependencies: TASK-040
- ID: TASK-040
  Title: Deployment baseline phase 2 - secrets and configuration management
  Status: Done (2026-02-16)
  Rationale: Centralized server configuration access in `lib/env.server.ts` (required/optional env readers, runtime mode checks, DB fallback, Supabase pair validation), migrated core server env reads to this module, added env guardrail tests, and documented the configuration baseline in README.
  Dependencies: TASK-039
- ID: TASK-039
  Title: Deployment baseline phase 1 - runtime target and exposure model
  Status: Done (2026-02-16)
  Rationale: Confirmed Vercel as deployment runtime target and adopted a public-exposure model secured by application-layer auth/authz (no trusted-IP allowlist dependency), with blob storage migration tracked explicitly as a deployment prerequisite.
  Dependencies: TASK-019
- ID: TASK-060
  Title: Boundary enforcement pass - explicit module ownership and layering rules
  Status: Done (2026-02-16)
  Rationale: Enforced service-layer ownership for persistence by extracting project/dashboard and Google credential DB operations into dedicated services, then codified dependency guardrails with ESLint restrictions that block direct `@/lib/prisma` imports outside `lib/services/**`.
  Dependencies: TASK-035, TASK-038
- ID: TASK-038
  Title: Validation suite phase 3 - CI quality gates
  Status: Done (2026-02-16)
  Rationale: Added CI quality-gates workflow that enforces lint/test/coverage/build and Playwright smoke checks on pull requests and `main`, with PostgreSQL-backed E2E isolation and failure artifact upload.
  Dependencies: TASK-036, TASK-037
- ID: TASK-006
  Title: Full validation suite after refinement pass
  Status: Done (Epic completed via TASK-036/TASK-037/TASK-038 on 2026-02-16)
  Rationale: Completed validation stack across API contracts, critical UI smoke journeys, and CI enforcement gates to reduce regression risk before upcoming architecture/auth/security work.
  Dependencies: TASK-038
- ID: TASK-037
  Title: Validation suite phase 2 - critical UI/E2E smoke flows
  Status: Done (2026-02-16)
  Rationale: Added Playwright-based smoke coverage for high-value UI journeys (project creation/navigation, task lifecycle with attachment interactions, calendar panel interaction states) with reusable test helpers and deterministic selectors.
  Dependencies: TASK-036
- ID: TASK-036
  Title: Validation suite phase 1 - API regression contracts
  Status: Done (2026-02-16)
  Rationale: Expanded route-level contract coverage to auth bootstrap/callback and project attachment endpoints (task + context-card create/delete/download), ensuring consistent error mapping and response contracts before auth/security/deployment changes.
  Dependencies: TASK-034
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
