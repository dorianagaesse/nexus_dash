# Architecture Decisions (ADR Log)

Use this file to record architectural decisions. Keep entries short and factual.

## Template
```
Date: YYYY-MM-DD
Decision: <short title>
Status: Proposed | Accepted | Deprecated
Context: <why this decision is needed>
Decision: <what was chosen and why>
Consequences: <tradeoffs, risks, follow-ups>
```

---
Date: 2026-02-11
Decision: Baseline stack setup (Next.js App Router + Prisma SQLite + Tailwind/Shadcn + Docker)
Status: Accepted
Context: TASK-001 requires a consistent foundation for the NexusDash app.
Decision: Use Next.js 14 App Router with TypeScript strict mode, Tailwind CSS + Shadcn UI components, Prisma ORM with SQLite, and Docker/Docker Compose for dev parity.
Consequences: Fast local iteration with a lightweight DB, consistent containerized dev flow, and a clear UI foundation for future features.
Date: 2026-02-11
Decision: Compose host port is configurable with safe default
Status: Accepted
Context: Local developer environments may already occupy host port `3000`, which blocked `docker compose up`.
Decision: Keep container port fixed at `3000` and map host port using `${APP_PORT:-3000}` in `docker-compose.yml`, documented in README.
Consequences: Default behavior remains `localhost:3000`, while developers can override to avoid conflicts without editing compose files.
Date: 2026-02-12
Decision: Use Next.js server actions for Project CRUD
Status: Accepted
Context: TASK-002 requires simple create/update/delete flows with low ceremony and direct Prisma access.
Decision: Implement CRUD mutations via server actions (`app/projects/actions.ts`) and render projects with a server component page (`app/projects/page.tsx`).
Consequences: Smaller API surface and simpler forms, with redirects used for status/error feedback.

Date: 2026-02-12
Decision: Use Debian Bullseye Node image for Prisma-compatible Docker runtime
Status: Accepted
Context: Prisma engine failed in Alpine and Debian Bookworm images due OpenSSL runtime mismatch during Next build/runtime.
Decision: Use `node:18-bullseye`, run `npx prisma generate` after source copy in `Dockerfile`, and run `npx prisma generate` at compose startup.
Consequences: Reliable Prisma behavior in containerized dev/build; slightly larger image footprint.
Date: 2026-02-12
Decision: Implement Kanban interactions with client-side DnD + server persistence API
Status: Accepted
Context: TASK-003 requires drag-and-drop interactions with reliable status/position persistence.
Decision: Use `@hello-pangea/dnd` in a client component (`components/kanban-board.tsx`) and persist board state through `POST /api/projects/[projectId]/tasks/reorder`.
Consequences: Smooth UX with optimistic movement and explicit persistence boundary; introduces one dedicated API endpoint for board updates.

Date: 2026-02-12
Decision: Normalize task status handling via shared constants/types
Status: Accepted
Context: Kanban columns and persistence logic require consistent status values across server/client.
Decision: Add `lib/task-status.ts` as the single source of truth for status values and validation helpers.
Consequences: Reduces string drift risk and improves strict typing for board operations.
Date: 2026-02-12
Decision: Use modal-based task creation on project dashboard
Status: Accepted
Context: Inline task form consumed too much vertical space and reduced board usability.
Decision: Replace inline form with compact "New task" trigger opening a lightweight modal form.
Consequences: Cleaner dashboard focus on Kanban board while preserving task creation capability.
Date: 2026-02-12
Decision: Make entire Kanban card the drag handle while preserving click-to-open details
Status: Accepted
Context: Users found small drag handle too restrictive and requested card-wide drag with full info on click.
Decision: Attach drag handle props to the full card surface and open a detail modal on card click.
Consequences: Faster interaction with fewer precise cursor movements; click-vs-drag behavior now depends on DnD movement threshold.
Date: 2026-02-12
Decision: Store task descriptions as sanitized HTML with plain-text projection for board previews
Status: Accepted
Context: TASK-009 requires rich-text authoring and editing while keeping board cards compact and safe.
Decision: Use a lightweight contenteditable editor in client UI, sanitize persisted HTML with `sanitize-html`, and convert to plain text for card previews.
Consequences: Enables rich-text descriptions and safer rendering with limited formatting tags; introduces a sanitization dependency.
Date: 2026-02-12
Decision: Support heading presets in rich-text task descriptions
Status: Accepted
Context: Users need stronger visual hierarchy in task descriptions for readability.
Decision: Add `Title 1` and `Title 2` formatting controls in editor and permit `h1/h2` tags through sanitization.
Consequences: Better structured task notes; sanitizer rules expanded but still controlled.
Date: 2026-02-12
Decision: Place task-creation trigger inside Kanban header via component action slot
Status: Accepted
Context: A separate helper card for task creation consumed space reserved for upcoming project-context content.
Decision: Add an optional `headerAction` slot to `KanbanBoard` and render `CreateTaskDialog` directly under the board title.
Consequences: Cleaner dashboard layout and reusable board-header extension point; board component API grows by one optional prop.
Date: 2026-02-12
Decision: Use HTML class-based theme toggle with localStorage persistence
Status: Accepted
Context: Users requested a bright mode and the app was forcing dark mode globally.
Decision: Remove forced `dark` class from root layout, add a client theme toggle that writes `nexusdash-theme` to localStorage, and apply saved mode on boot via inline script.
Consequences: Reliable persisted theme selection without additional theming dependencies; includes a small inline script in layout.
Date: 2026-02-12
Decision: Use modal-first project creation on `/projects` page
Status: Accepted
Context: Inline creation form consumed significant vertical space and delayed access to current projects.
Decision: Replace inline create-project card with a compact `Create project` modal trigger and reuse existing server action submission pattern.
Consequences: Cleaner projects-first page flow and consistent modal UX with task creation; introduces one additional client component.
Date: 2026-02-12
Decision: Persist blocked-task follow-up notes as first-class task data
Status: Accepted
Context: Blocked tasks require dedicated, editable warning context in expanded task details.
Decision: Add optional `blockedNote` field on `Task` and expose it through dashboard payloads and task update API.
Consequences: Better blocker traceability and clearer follow-up ownership; requires schema migration and additional task payload mapping.
Date: 2026-02-12
Decision: Persist Done lifecycle metadata for automatic task archiving
Status: Accepted
Context: Done column needs to stay compact as completed tasks accumulate over time.
Decision: Add `completedAt` and `archivedAt` on `Task`, auto-archive stale Done tasks (>7 days) at dashboard load, and expose archived tasks via a Done-column archive dropdown.
Consequences: Scalable Done-column UX with preserved historical visibility; introduces additional lifecycle state handling in reorder and dashboard query paths.
Date: 2026-02-12
Decision: Implement project context cards using existing `Resource` model discriminator
Status: Accepted
Context: Project context cards are needed now, while richer resource/document handling remains planned for later tasks.
Decision: Reuse `Resource` with `type = "context-card"` and map `name -> title`, `content -> content` instead of introducing a new model.
Consequences: Faster delivery with no schema migration; requires careful filtering by resource type and leaves room for future resource-model refinement.
Date: 2026-02-12
Decision: Store optional context card color on `Resource` for lightweight card theming
Status: Accepted
Context: Context cards need pastel background colors with user-controlled selection and random defaults at creation.
Decision: Add optional `color` field on `Resource`, validate against a controlled pastel palette, and fallback deterministically for legacy cards without color.
Consequences: Better visual differentiation with minimal schema impact; introduces one additional migration and validation path for context card updates.
Date: 2026-02-12
Decision: Persist dashboard section expansion state per project via browser storage
Status: Accepted
Context: Users need `Project context` and `Kanban board` to reopen in their preferred expanded/collapsed state after refresh.
Decision: Store section state in localStorage with project-scoped keys and restore client-side on component mount.
Consequences: Better continuity for daily usage without backend schema/API changes; component state becomes client-storage dependent.
Date: 2026-02-12
Decision: Introduce attachment system with local filesystem backend and S3-ready abstraction
Status: Accepted
Context: Tasks and context cards need link/file attachments now, while cloud object storage integration is planned for a later phase.
Decision: Add dedicated attachment models (`TaskAttachment`, `ResourceAttachment`), validate file uploads via allowlist + size cap, and persist files under `/storage/uploads` through shared `lib/attachment-storage.ts` helpers.
Consequences: Immediate local attachment support with predictable migration path to external object storage; adds file lifecycle management responsibilities and new API surface for upload/download/delete.
Date: 2026-02-15
Decision: Pre-auth architecture direction (targeted medium refactor vs full rewrite)
Status: Accepted
Context: TASK-035 architecture audit identified boundary issues (missing user ownership model, global calendar credential singleton, very large client orchestration components, and mixed server-action/API mutation paths) that increase risk for TASK-020/TASK-021/TASK-023.
Decision: Prefer a targeted medium refactor that strengthens boundaries (service-layer extraction, auth-ready data model, frontend panel decomposition, and operational guardrails) before full authentication/security rollout, instead of a big-bang redesign.
Consequences: Lower delivery risk and faster incremental progress with less rework; requires short-term refactor investment before major auth/security implementation.
Date: 2026-02-15
Decision: Centralize mutation and integration rules in backend service modules
Status: Accepted
Context: TASK-053 requires clear boundaries so server actions and API routes can share validation/business rules and remain auth-ready.
Decision: Extract task/context-card/attachment/calendar logic into `lib/services/*` and keep route handlers/actions focused on transport concerns (request parsing, response mapping, cache revalidation, redirects).
Consequences: Less duplication and drift across mutation paths, better testability of business logic, and cleaner insertion points for future authz checks.
Date: 2026-02-15
Decision: Decompose large client panels via utility modules and shared UI-state hooks
Status: Accepted
Context: TASK-054 targets oversized orchestration components (`kanban-board.tsx`, `project-context-panel.tsx`, `project-calendar-panel.tsx`) that were mixing rendering, formatting, local persistence, and interaction logic in single files.
Decision: Extract panel-specific pure helpers into dedicated modules, move calendar date-time field into its own component, and standardize section-expansion localStorage behavior through `useProjectSectionExpanded`.
Consequences: Smaller and clearer panel files with lower regression risk; future UI refactors can evolve in isolated modules without reworking full panel components.
Date: 2026-02-15
Decision: Unify project/task/context mutation transport on API routes
Status: Accepted
Context: TASK-055 requires one mutation boundary per use case so validation/auth checks are enforced consistently without split server-action/API execution paths.
Decision: Promote API routes as the canonical mutation transport for task creation and context-card CRUD, wire client components directly to those endpoints, and retire legacy project-level server-action mutation wrappers.
Consequences: Cleaner, single mutation entrypoints and simpler future authz middleware integration; frontend forms now handle async submit/error states explicitly.
Date: 2026-02-15
Decision: Adopt PostgreSQL baseline with Supabase-managed Postgres as default hosted target
Status: Accepted
Context: TASK-056 requires a data-platform decision before migration/auth/security phases, balancing concurrency, operational burden, lock-in risk, and delivery speed.
Decision: Use PostgreSQL as the canonical persistence engine, target Supabase-managed Postgres by default for hosted environments, and keep Prisma schema/migrations repository-owned and provider-agnostic.
Consequences: Enables near-term production readiness and remote multi-user capability with lower ops burden; requires explicit guardrails to avoid premature coupling to Supabase-specific platform features.
Date: 2026-02-15
Decision: Reset migration history for PostgreSQL parity baseline while preserving SQLite lineage
Status: Accepted
Context: TASK-057 migrates runtime persistence from SQLite to PostgreSQL without carrying local SQLite data; existing migration chain was SQLite-specific and incompatible as-is for PostgreSQL deploy.
Decision: Keep prior SQLite migrations under `prisma/migrations-sqlite-legacy` for traceability, create a new PostgreSQL `prisma/migrations` baseline from the current schema, and enforce Postgres env contracts (`DATABASE_URL`, `DIRECT_URL`) in docs/runtime.
Consequences: Clean, deployable Postgres migration history for new environments with preserved historical audit trail; teams migrating old local SQLite data must use a separate one-off data transfer path if needed.
Date: 2026-02-15
Decision: Use single Supabase project branch as interim environment until deployment split
Status: Accepted
Context: Supabase project branching is unavailable on the current plan, and the base Supabase branch is labeled `main (PRODUCTION)` by platform convention.
Decision: Continue using the current Supabase `main` branch for controlled development/testing during pre-deployment phase, with repository-owned migrations and explicit documentation of this temporary constraint.
Consequences: Maintains delivery velocity but requires disciplined handling of environment expectations; proper dev/staging/prod separation remains a required follow-up in deployment phases.
Date: 2026-02-16
Decision: Enforce persistence boundary through service-layer ownership and lint restrictions
Status: Accepted
Context: TASK-060 requires explicit, durable layering rules so upcoming auth/share/agent work does not reintroduce direct database coupling in UI/page or transport layers.
Decision: Restrict direct Prisma access to `lib/services/**`, move remaining app-layer DB usage into dedicated services (`project-service`, `google-calendar-credential-service`), and enforce violations with ESLint `no-restricted-imports` overrides.
Consequences: Stronger separation of concerns and safer evolution of auth/security features; introduces stricter import governance that may require small refactors when adding new flows.
Date: 2026-02-16
Decision: Centralize server environment access and validation in one module
Status: Accepted
Context: TASK-040 requires consistent secrets/config behavior across server routes, Prisma runtime helpers, and deployment environments before CI/CD rollout.
Decision: Add `lib/env.server.ts` as the single server-side environment access layer (required/optional readers, runtime mode checks, DB config fallback, Supabase pair validation) and migrate existing server env reads to this module.
Consequences: Fewer scattered `process.env` reads, better testability, and clearer failure modes for missing/partial config; future env policy changes can be applied in one place.
Date: 2026-02-16
Decision: CI quality gates must include container image build verification
Status: Accepted
Context: TASK-041 requires validating not only source quality (lint/tests/build) but also the deployable artifact before deployment/rollback phases.
Decision: Extend `quality-gates.yml` with a dedicated container-image job that runs after quality and E2E gates, builds the Docker image in CI, and uploads image metadata as an artifact.
Consequences: Earlier detection of Dockerfile/runtime build regressions and clearer release readiness signals; slightly longer CI duration due to image build step.
Date: 2026-02-17
Decision: Use staged Vercel CLI deployments with explicit promote/rollback operations
Status: Accepted
Context: TASK-042 requires a low-risk CD baseline with rollback capability while keeping release control explicit.
Decision: Add `deploy-vercel.yml` to create staged production deployments after successful quality gates on `main`, and expose manual `deploy-preview`, `deploy-production-staged`, `promote`, and `rollback` actions through workflow dispatch.
Consequences: Faster recovery path and clearer release control with auditable deployment artifacts; requires Vercel repository secrets and operator discipline for promote/rollback steps.
Date: 2026-02-17
Decision: Force explicit Vercel scope and non-interactive promote/rollback in CI
Status: Accepted
Context: Manual `promote`/`rollback` operations failed in GitHub Actions due scope drift and confirmation prompts in non-interactive runs.
Decision: Pass explicit scope (`--scope`) to Vercel CLI operations and add `--yes` to `promote`/`rollback` commands in `deploy-vercel.yml`.
Consequences: Deterministic CI deploy context and reliable manual promotion/rollback execution; workflow now depends on consistent scope resolution from `VERCEL_ORG_ID`.
Date: 2026-02-17
Decision: Enforce runtime env fail-fast validation with production DIRECT_URL requirement
Status: Accepted
Context: TASK-066 requires stronger config/secrets guarantees before production rollout, including startup validation and tighter Prisma env contracts.
Decision: Add centralized `validateServerRuntimeConfig` checks (DB URL shape, optional env pair/triplet completeness, URL validation), require `DIRECT_URL` in production runtime, and execute validation at server startup via `app/layout.tsx`.
Consequences: Misconfigured environments fail early with explicit errors, reducing runtime surprises; CI/build pipelines must provide minimal DB env variables for validation.
Date: 2026-02-17
Decision: Add provider-based attachment storage with Cloudflare R2 default and local fallback
Status: Accepted
Context: TASK-065 requires replacing local-only attachment persistence so deployment can run on serverless runtimes without relying on local disk durability.
Decision: Introduce `StorageProvider` abstraction (save/read/delete/signed-download-url), keep local filesystem provider for development, and add Cloudflare R2 provider with signed URL download support.
Consequences: Storage backend becomes configurable with minimal service-layer changes; production deployments gain durable object storage while local development remains simple.
Date: 2026-02-18
Decision: Auth UX and session baseline must include home-page entry flow and persistent server-side session lifecycle
Status: Accepted
Context: Product direction requires "real auth" from the user perspective (signed-out landing behavior, sign in/up options, and persistent sessions) before public multi-user usage scales.
Decision: Fold explicit home-page auth entry behavior (`Sign in`/`Sign up` for signed-out users, workspace redirect for signed-in users), modern session lifecycle policy (rotation/revocation/TTL), and phased provider rollout into auth scope (TASK-020/TASK-045/TASK-047, plus TASK-068 for additional social providers).
Consequences: Auth implementation scope is clearer and more testable, reducing ambiguity between backend-only auth and full product UX; initial auth delivery remains phased to control risk.
Date: 2026-02-18
Decision: Lock hybrid auth/session model (DB-backed user sessions + JWT-style scoped agent/API tokens)
Status: Accepted
Context: Product goals require strong user-session security (revocation, durable login UX, account lifecycle) and future non-human access for personal project automation agents.
Decision: Use DB-backed sessions for interactive user authentication (Auth.js + Prisma adapter path) and reserve JWT-style scoped tokens for agent/API access in TASK-059, rather than adopting pure JWT browser sessions for all actors.
Consequences: Better user-session control, auditability, and revocation semantics for the dashboard; keeps agent access flexible without coupling browser login security to long-lived bearer tokens.
Date: 2026-02-20
Decision: Complete dashboard panel decomposition with module-level UI extraction
Status: Accepted
Context: TASK-062 identified that `kanban-board.tsx`, `project-context-panel.tsx`, and `project-calendar-panel.tsx` were still oversized orchestration files even after earlier utility extraction, increasing change-risk before auth/security work.
Decision: Keep existing data/mutation contracts intact while extracting rendering-heavy UI surfaces into focused modules (`components/kanban/*`, `components/context-panel/*`, `components/calendar-panel/*`) and shared panel types files, leaving parent components as state/action orchestrators.
Consequences: Lower regression surface per change and clearer ownership boundaries for future iterations; introduces additional component interfaces/prop wiring that must remain aligned during future feature work.
