# Architecture Decisions (Working Log)

Use this file for concise architecture-impacting decisions only.
Keep UI-only or task-only notes in `journal.md`.

## Entry Template

```md
## YYYY-MM-DD - <short decision title>
- Status: Accepted | Superseded | Deprecated | Proposed
- Context: <why this decision was needed>
- Decision: <what we chose>
- Consequences: <tradeoffs, constraints, follow-ups>
- Links: <ADR/tasks/PRs if relevant>
```

## Active Decisions

## 2026-03-31 - Ship agent access v1 as project-scoped API credentials exchanged into short-lived bearer tokens
- Status: Accepted
- Context: TASK-059 needs safe non-human access without reusing browser sessions, while preserving the current human session model, RLS visibility boundary, and project-scoped authorization guarantees.
- Decision: Store owner-managed API credentials per project with explicit scope grants, show the raw key only once, hash secrets at rest, exchange raw keys at a dedicated auth endpoint for short-lived signed bearer tokens, and enforce agent scope/project checks explicitly in project/task/context services and routes while resolving DB visibility through the credential owner's RLS subject.
- Consequences: Agent automation now has a safe first-class path with rotation, revocation, and auditability, but v1 intentionally excludes calendar delegation and binary attachment parity until ownership semantics for those assets are designed explicitly.
- Links: `tasks/task-059-agent-access-implementation.md`, `lib/auth/api-guard.ts`, `lib/auth/agent-token-service.ts`, `lib/services/project-agent-access-service.ts`, `prisma/migrations/20260331153000_task059_agent_access_v1/migration.sql`

## 2026-03-24 - Bind collaboration invites to verified email identity and use copyable links as delivery only
- Status: Accepted
- Context: TASK-103 extends project sharing beyond existing verified users, but the v1 verified-account authorization model should remain intact and invite links must not become anonymous claim tokens.
- Decision: Store invitations against normalized recipient email, require acceptance by an authenticated verified account whose verified email matches that invited email, and treat invite links purely as a resumable delivery mechanism that routes the recipient through sign-in, sign-up, verification, or wrong-account correction before acceptance.
- Consequences: Owners can invite collaborators before an account exists and recipients can resume safely after account creation or verification, while invite acceptance stays identity-bound rather than link-bound; invitation RLS/listing must resolve by verified email and auth flows must preserve `returnTo` state.
- Links: `tasks/current.md`, `lib/services/project-collaboration-service.ts`, `lib/navigation/return-to.ts`, `app/invite/project/[invitationId]/page.tsx`, `prisma/migrations/20260324110000_task103_email_bound_project_invites/migration.sql`

## 2026-03-21 - Auto-verify email/password signups on preview deployments only
- Status: Accepted
- Context: TASK-058 collaboration testing on preview requires invite search to work for email/password accounts, but preview intentionally avoids a full email verification workflow to keep manual validation lightweight.
- Decision: Automatically mark email/password signups as verified when `VERCEL_ENV=preview`, while preserving normal verification requirements for production and other non-preview environments.
- Consequences: Preview collaboration testing is faster and less brittle, but preview account semantics differ intentionally from production; future testing/debugging should assume preview-created credential accounts are already verified.
- Links: `lib/env.server.ts`, `lib/services/credential-auth-service.ts`, `tests/lib/credential-auth-service.test.ts`

## 2026-03-20 - Ship project sharing v1 as verified existing-user invites with owner-managed collaboration controls
- Status: Accepted
- Context: TASK-058 needed a practical first release of collaboration that fits the current authenticated app and RLS architecture without overcommitting to email/link-based invitation complexity yet.
- Decision: Implement project sharing v1 around owner-managed invites for existing verified users only, with `editor`/`viewer` invite roles, single-owner projects, recipient-side invitation visibility in the authenticated app, and service-enforced invite acceptance/membership mutation flows.
- Consequences: Collaboration is now usable without introducing tokenized public invites; a later follow-up can add arbitrary email/link invitations and ownership transfer without redefining the core permission model.
- Links: `tasks/current.md`, `lib/services/project-collaboration-service.ts`, `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`

## 2026-03-20 - Gate project calendar mutations by project role while keeping Google Calendar credentials user-scoped
- Status: Accepted
- Context: TASK-058 makes project roles user-visible across the workspace, but the existing Google Calendar integration remains tied to each individual user's credentials rather than a shared project calendar.
- Decision: Keep calendar ownership user-scoped for now, but require project membership and at least `editor` role for create/update/delete operations triggered from a project surface, with `viewer` limited to read-only access.
- Consequences: Project permissions stay coherent across the workspace while shared calendar ownership remains explicitly deferred; a future calendar-sharing task can evolve storage/credential semantics without reopening TASK-058 role expectations.
- Links: `tasks/current.md`, `lib/services/calendar-service.ts`, `app/api/calendar/events/route.ts`, `app/api/calendar/events/[eventId]/route.ts`

## 2026-03-05 - Propagate app principal via transaction-scoped Postgres settings for RLS
- Status: Accepted
- Context: TASK-085 requires DB-level isolation on project/user scoped tables while runtime uses pooled connections, which makes session-level `SET` unsafe.
- Decision: Added `withActorRlsContext()` service helper to run protected operations in a transaction, set `app.user_id` via `set_config(..., true)`, and evaluate RLS policies through `app.current_user_id()` in PostgreSQL.
- Consequences: RLS policy evaluation is actor-aware and pooler-safe; service paths touching protected tables must run through actor-context transactions.
- Links: `tasks/task-085-postgresql-rls-staged-rollout.md`, `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`, `lib/services/rls-context.ts`

## 2026-03-04 - Narrow username discriminator contract to 4-digit numeric format
- Status: Accepted
- Context: Username identity tags previously used 6-character base36 discriminators, but product direction now requires a shorter numeric-only suffix.
- Decision: Updated generation to `0000-9999`, added discriminator format validation in account identity/profile services, and applied schema/migration hardening (`VARCHAR(4)` + numeric regex check constraint).
- Consequences: New tags are more predictable and easier to communicate; legacy invalid discriminator values are sanitized and regenerated during username updates.
- Links: `tasks/current.md`, `prisma/migrations/20260304221000_task092_username_discriminator_numeric4/migration.sql`

## 2026-02-26 - Introduce username + discriminator identity contract for credentials signup
- Status: Accepted
- Context: Account onboarding needed a user-chosen identity without username-availability prechecks, while preserving `user.id` as the authorization key.
- Decision: Added `User.username` and `User.usernameDiscriminator` fields with composite uniqueness, validated username policy (`3-20`, lowercase alnum + `.` + `_`), enforced confirm-password matching, and generated collision-safe 6-char base36 discriminator suffixes during signup.
- Consequences: Signup identity is now deterministic and human-readable (`username#suffix`) for account-context surfaces; future account profile flows must preserve discriminator uniqueness semantics when introducing username edits.
- Links: `tasks/current.md`, `prisma/migrations/20260226113000_task081_username_identity/migration.sql`

## 2026-02-23 - Enforce principal-scoped boundaries for DB/storage/calendar
- Status: Accepted
- Context: Multi-user readiness required removing remaining singleton and ID-only access paths.
- Decision: Enforced actor-aware service contracts, ownership/membership checks, user-scoped Google credentials, and ownership-safe storage keys (`v1/{userId}/{projectId}/...`).
- Consequences: Cross-user leakage risks are significantly reduced; strict ownership assumptions are now part of all project-scoped service contracts.
- Links: `adr/task-076-supabase-r2-google-calendar-boundaries.md`

## 2026-02-20 - Define modern auth/authz contract before auth rollout
- Status: Accepted
- Context: Upcoming auth tasks needed a locked boundary model to prevent iterative rework.
- Decision: Adopted hybrid contract: DB-backed user sessions + scoped non-human token model, role-based project authorization, service-layer enforcement.
- Consequences: Auth implementation became phased and explicit, with clear sequencing constraints.
- Links: `adr/task-020-modern-auth-authorization-adr.md`

## 2026-02-20 - Execute dedicated boundary transition before route protection
- Status: Accepted
- Context: Schema bootstrap alone was insufficient to guarantee data isolation.
- Decision: Introduced TASK-076 as required implementation step before TASK-046 route/API protection.
- Consequences: Added short-term implementation scope, reduced long-term authorization drift risk.
- Links: `adr/task-020-modern-auth-authorization-adr.md`, `adr/task-076-supabase-r2-google-calendar-boundaries.md`

## 2026-02-18 - Keep hybrid auth/session direction
- Status: Accepted
- Context: Product needs durable user sessions plus future agent/API access.
- Decision: Keep DB-backed user sessions for interactive auth; reserve scoped JWT-style tokens for non-human actors.
- Consequences: Better revocation/control for user auth; agent access remains a separate implementation phase.
- Links: `adr/task-020-modern-auth-authorization-adr.md`

## 2026-02-17 - Use staged Vercel deploy workflow with manual promote/rollback
- Status: Accepted
- Context: Needed low-risk release control with quick rollback path.
- Decision: Added Vercel CLI workflow supporting staged production deploy, preview deploy, promote, and rollback.
- Consequences: Clear operational release path; requires disciplined secret/env management.
- Links: `.github/workflows/deploy-vercel.yml`

## 2026-02-17 - Enforce startup fail-fast runtime config validation
- Status: Accepted
- Context: Production misconfiguration risk was too high without strict env checks.
- Decision: Centralized runtime validation and enforced production `DIRECT_URL` + DB hardening invariants.
- Consequences: Misconfigured environments fail early; CI/deploy environments must provide minimum DB contract.
- Links: `lib/env.server.ts`, `docs/runbooks/database-connection-hardening.md`

## 2026-02-17 - Keep provider-based attachment storage (`local` + `r2`)
- Status: Accepted
- Context: Serverless deployments cannot rely on local filesystem durability.
- Decision: Added `StorageProvider` abstraction with local fallback and Cloudflare R2 implementation.
- Consequences: Flexible storage backend with minimal service churn; direct upload support depends on provider capability.
- Links: `lib/storage/`, `tasks/task-065-storage-provider-r2.md`

## 2026-02-16 - Enforce service-layer ownership for persistence access
- Status: Accepted
- Context: Direct DB access from transport/UI layers created auth and maintenance risk.
- Decision: Restricted Prisma usage to `lib/services/**` and enforced via lint restrictions.
- Consequences: Stronger layering and cleaner authz insertion points; new features must honor service boundaries.
- Links: `tasks/task-060-boundary-enforcement.md`

## 2026-02-16 - CI gates include deploy artifact verification
- Status: Accepted
- Context: Source-only checks were insufficient for deployment safety.
- Decision: Added container image build + metadata artifact gate after quality + E2E checks.
- Consequences: Better deploy confidence at the cost of longer CI runtime.
- Links: `.github/workflows/quality-gates.yml`, `tasks/task-041-ci-pipeline-build-image.md`

## 2026-02-16 - Centralize server env access contract
- Status: Accepted
- Context: Scattered `process.env` usage caused drift and inconsistent validation.
- Decision: Introduced `lib/env.server.ts` as the single env access/validation layer.
- Consequences: Easier testing and policy evolution; all server code should use this module.
- Links: `tasks/task-040-secrets-config-management.md`

## 2026-02-15 - Adopt PostgreSQL baseline, Supabase as default hosted target
- Status: Accepted
- Context: SQLite constraints blocked multi-user and production readiness.
- Decision: Switched canonical runtime to PostgreSQL; use Supabase-hosted Postgres by default, while keeping app/provider contracts Prisma-owned.
- Consequences: Production-ready data path with managed ops tradeoffs.
- Links: `adr/task-056-data-platform-adr.md`

## 2026-02-15 - Reset migrations for PostgreSQL baseline and archive SQLite history
- Status: Accepted
- Context: Existing migration chain was SQLite lineage and not deploy-safe for Postgres baseline.
- Decision: Started new Postgres migration history under `prisma/migrations`; moved old chain to `prisma/migrations-sqlite-legacy`.
- Consequences: Clean Postgres deploy path; old SQLite data migration is explicitly out-of-band.
- Links: `adr/task-057-supabase-environment-strategy.md`

## 2026-02-15 - Targeted medium refactor before full auth/security phases
- Status: Accepted
- Context: Architecture audit found boundary gaps and high change risk.
- Decision: Chose phased medium refactor (service extraction, schema/boundary hardening, UI decomposition) over big-bang rewrite.
- Consequences: Lower rework risk and better delivery continuity.
- Links: `tasks/task-035-architecture-audit.md`

## Historical (Still Useful Context)

## 2026-02-12 - Use `node:18-bullseye` Docker base for Prisma compatibility
- Status: Accepted
- Context: Alpine/Bookworm OpenSSL mismatches broke Prisma runtime/build.
- Decision: Standardized Docker base on Debian Bullseye image.
- Consequences: Stable Prisma behavior with larger image footprint.

## 2026-02-11 - Compose host port is configurable (`APP_PORT`)
- Status: Accepted
- Context: Local port conflicts blocked developer startup.
- Decision: Keep container port `3000`, map host port with `${APP_PORT:-3000}`.
- Consequences: Safer local onboarding in mixed environments.
