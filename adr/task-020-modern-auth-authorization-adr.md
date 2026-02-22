# TASK-020 Modern Authentication/Authorization ADR

Date: 2026-02-20
Status: Accepted (2026-02-21)

## 1) Decision Summary

Adopt a hybrid, production-grade auth architecture with clear actor boundaries:

- Keep `Prisma + PostgreSQL (Supabase-hosted)` as the system of record.
- Use `Auth.js` (NextAuth) with Prisma adapter and database-backed user sessions for browser/user auth.
- Keep application servers stateless; auth state is stored in DB (with optional Redis cache layer for session lookups).
- Use scoped API key credentials for non-human actors, and mint short-lived JWT access tokens for agent/API runtime calls.
- Enforce authorization in the service layer (`lib/services/**`) with project membership + role checks.
- Defer public API exposure until core auth/authz hardening and testing tasks are completed.
- Enforce delivery guardrails for implementation tasks: one task per PR, automatic Copilot reviewer only (no manual tagging), and mandatory green CI plus preview deployment before merge for deployment-affecting changes.

This ADR is the implementation contract for TASK-045, TASK-076, TASK-046, TASK-047, TASK-058, TASK-059, and TASK-048.
Execution sequencing includes a dedicated multi-user boundary transition task (`TASK-076`) between schema bootstrap and route-protection rollout.
Detailed Supabase/R2/Google Calendar boundary execution rules are captured in `adr/task-076-supabase-r2-google-calendar-boundaries.md`.

## 2) Context

Current app state:
- No first-class user/account/session model in Prisma schema.
- Project/task/resource access is effectively ID-scoped, not principal-scoped.
- Middleware currently adds request IDs only; no auth guard in request pipeline.
- Google calendar credential persistence is global singleton, not user-scoped.

Roadmap constraints:
- Need modern auth UX (signed-out home entry, persistent sessions).
- Need secure agent/non-human access model.
- Need to keep delivery velocity and existing service-layer boundaries.
- Need stateless scaling behavior for Vercel/serverless runtime.

## 2.1) Delivery Guardrails (Binding)

- One task per branch/PR. Complex tasks must not be bundled in a shared PR.
- No manual `@copilot review` tagging in PR comments. Copilot reviewer is automatic.
- Any task that changes runtime/build/migrations/infrastructure-facing behavior must pass:
  - all required GitHub checks,
  - successful preview deployment validation before merge.
- If a preview deployment fails, fix and re-validate in the same task PR before merge approval.
- Merges must preserve rollback safety:
  - schema foundation (`TASK-045`) ships before principal-boundary behavior (`TASK-076`),
  - route protection (`TASK-046`) starts only after both are complete.

## 3) Goals

- Provide secure multi-user authn/authz baseline with revocation and auditability.
- Make authorization explicit and enforceable at service boundaries.
- Support non-human access with scoped, revocable credentials.
- Preserve stateless server operation (no in-memory session dependency).
- Keep implementation incremental across backlog phases.

## 4) Non-Goals

- Public third-party API exposure in this phase.
- Replacing Prisma domain data access with Supabase REST/PostgREST for core entities.
- Introducing tenant-level enterprise SSO/SAML at this stage.

## 5) Option Assessment

### Option A: Pure stateless JWT sessions for browser + agents
- Pros: minimal DB session reads.
- Cons: weak revocation semantics, higher token leakage blast radius, harder secure account/session lifecycle.
- Verdict: rejected for user browser auth.

### Option B: DB sessions for users + scoped API keys/JWT for agents (selected)
- Pros: strong user-session revocation/control, clear actor split, practical security posture, supports stateless app compute.
- Cons: more moving parts (session tables, token exchange flow, scope checks, audit events).
- Verdict: selected.

### Option C: Supabase Auth as primary app auth boundary (without Prisma-auth alignment)
- Pros: fast initial auth bootstrap.
- Cons: duplicates identity boundary versus existing Prisma service architecture; increases integration complexity now.
- Verdict: deferred, not selected for current roadmap.

## 6) Target Architecture

### 6.1 User Authentication (Interactive)
- Auth runtime: `Auth.js` + Prisma adapter.
- Session strategy: database sessions (`Session` table), cookie-based session tokens.
- Session cookie rules:
  - `httpOnly`, `secure` in production, `sameSite=lax`, strict TTL/rotation policy.
- Optional cache layer:
  - Redis read-through cache for session lookup acceleration (non-authoritative).
  - DB remains source of truth.

### 6.2 Authorization (User Access Control)
- Resource ownership:
  - Each project has one owner user.
- Collaboration:
  - Project membership relation with role enum: `owner`, `editor`, `viewer`.
- Enforcement:
  - All service methods that read/write project-scoped entities must validate principal + role.
  - API routes/pages remain transport/UI adapters; authorization logic lives in services.

### 6.3 Agent/API Authentication (Non-Human)
- Credential model:
  - Long-lived API key credential (one-time display, hashed at rest).
- Runtime auth:
  - API key used to obtain short-lived JWT access token with bounded scopes.
- Token characteristics:
  - Short TTL (target 5-15 minutes).
  - Includes principal, scope set, project constraints, and token ID (`jti`).
- Revocation model:
  - API key revocation is immediate and authoritative.
  - JWT remains short-lived to minimize revocation lag.

### 6.4 Public API Exposure
- Explicitly deferred until:
  - user auth baseline + authorization + agent token scope model + hardening tests are complete.

### 6.5 Multi-User Data and Storage Boundary Transition (`TASK-076`)
- Database boundary changes:
  - Move project/task/resource reads and writes to principal-scoped queries (actor + membership role), not route ID-only filtering.
  - Ensure all service-layer operations enforce ownership/membership authorization before persistence or fetch.
  - Backfill and enforce ownership relations so no project-scoped object is orphaned from a principal context.
- Supabase/Postgres operational boundary:
  - Keep Prisma migrations as canonical schema control.
  - Use least-privilege runtime DB credentials and separate migration/admin credentials.
- Cloudflare R2 boundary changes:
  - Keep bucket private; all upload/download access is brokered by authorized app endpoints.
  - Enforce permission checks before issuing signed URLs.
  - Standardize tenant-safe object key strategy and attachment metadata ownership (`uploadedByUserId`).
  - Add cleanup/audit mechanisms for orphaned objects and ownership drift.
- Google Calendar boundary changes:
  - Replace singleton `GoogleCalendarCredential` token ownership with user-scoped Google calendar credentials.
  - Bind OAuth initiation/callback to the authenticated principal and prevent cross-user token attachment.
  - Resolve calendar API contexts from current principal + authorization checks, not global credential lookup.

## 7) Data Model Changes (Planned)

### 7.1 Auth.js-Compatible Entities
- `User`
- `Account`
- `Session`
- `VerificationToken`

### 7.2 Authorization Entities
- `Project.ownerId` (FK -> `User`)
- `ProjectMembership` (projectId, userId, role, createdAt, updatedAt)
- `ProjectInvitation` (projectId, email, role, tokenHash, expiresAt, acceptedAt, revokedAt)

### 7.3 Agent Access Entities
- `ApiCredential` (hashed key, label, creator user, expiry, revokedAt, lastUsedAt)
- `ApiCredentialScope` (credential to scope/project constraint mapping)
- `AuthAuditEvent` (actor, action, target, timestamp, requestId, metadata)

### 7.4 Existing Integration Migration
- Replace singleton `GoogleCalendarCredential` with user-scoped credential relation.

## 8) Authorization Policy Baseline

Project-role permission matrix:
- `owner`: full read/write/delete + membership/invite management.
- `editor`: project read + task/context/calendar mutation; no ownership transfer/delete.
- `viewer`: read-only project/task/context/calendar.

Agent scope examples:
- `project:read`
- `task:write`
- `context:write`
- `calendar:read`

Policy rules:
- Default deny when principal/scope/role checks fail.
- No direct data access path bypassing service-layer authorization guards.

## 9) Security Baseline Requirements

- Hash secrets at rest (API keys, invite tokens, password hashes).
- Strong password hashing (`argon2id` preferred; acceptable fallback `bcrypt` with strong cost).
- Rate-limit and abuse controls for auth endpoints (detailed policy in security phases).
- CSRF protections for session-based browser flows.
- Session rotation on sensitive actions and clear sign-out invalidation behavior.
- Structured auth audit logging with request correlation IDs.

## 10) Server Statelessness Strategy

- No in-memory authoritative session store on app instances.
- DB as authoritative state.
- Optional Redis cache to reduce DB read pressure for high session volume.
- JWT verification remains stateless at request time, with lifecycle bounded by short TTL and key revocation at issuance source.

## 11) Implementation Roadmap Mapping

- TASK-045:
  - Add user/session/auth schema and migrations.
  - Keep scope limited to Auth.js-compatible persistence bootstrap (`User`, `Account`, `Session`, `VerificationToken`) in a standalone PR.
- TASK-076:
  - Add ownership/membership foundation (`Project.ownerId`, `ProjectMembership`, `ProjectInvitation`) and backfill strategy.
  - Add user-scoped calendar credential model and migration away from global singleton credential ownership.
  - Transition service-layer DB access to principal-scoped authorization filtering.
  - Apply multi-user ownership constraints to attachment metadata and R2 signed URL issuance paths.
  - Validate Supabase credential boundaries (runtime vs migrate/admin) for least privilege.
  - Replace global Google Calendar credential singleton with user-scoped credential flow and principal-bound OAuth callback handling.
- TASK-046:
  - Integrate Auth.js runtime, session retrieval helpers, route/page protection.
  - Add service-layer principal requirement for protected operations.
- TASK-047:
  - Signed-out home entry (`Sign in`/`Sign up`), onboarding, signed-in redirect behavior.
- TASK-058:
  - Membership roles + invitation flows + permission enforcement coverage.
- TASK-059:
  - API key issuance/rotation/revocation + short-lived agent JWT exchange + scope enforcement.
- TASK-048:
  - Full auth/authz regression suite, edge-case hardening, and security validation.

### 11.1 Scope Boundary for TASK-045 (must be standalone PR)
- Includes schema entities and migration-safe data bootstrap only.
- Includes service scaffolding needed to support new entities without changing broad authorization behavior.
- Excludes full principal-boundary retrofit across storage/calendar/project services (that is `TASK-076`).

### 11.2 Scope Boundary for TASK-076 (must be standalone PR)
- Includes principal-scoped authorization enforcement across service boundaries.
- Includes Supabase/R2/Google Calendar ownership boundary enforcement.
- Excludes user/session schema bootstrapping work already delivered by `TASK-045`.

### 11.3 Merge Gates for TASK-045 and TASK-076
- Green required CI checks.
- Preview deployment validated as healthy for the task PR commit.
- Copilot review conversations answered and resolved in-thread before merge.

## 12) Migration and Backward Compatibility

- For existing single-user data:
  - Create bootstrap owner user.
  - Backfill existing projects with `ownerId` and owner membership row.
- Maintain existing project/task/resource IDs and payload contracts where feasible.
- Roll out auth gates incrementally to avoid full freeze/big-bang cutover.

## 13) Testing Strategy

Must-have coverage before closing auth epic phases:
- Session lifecycle tests (create, refresh/rotation, revoke, sign-out).
- Authorization tests by role for all project-scoped APIs.
- Agent token tests (scope allow/deny, expiry, revoked credential behavior).
- E2E flows for signed-out -> sign-in -> workspace -> protected route enforcement.
- Regression tests for invite acceptance and cross-project access isolation.

## 14) Risks and Mitigations

- Risk: authorization drift across endpoints.
  - Mitigation: central service-layer guards + contract tests for forbidden/unauthorized responses.
- Risk: token sprawl and weak revocation semantics.
  - Mitigation: hashed API credentials, short JWT TTL, explicit rotation/revocation endpoints.
- Risk: migration complexity from singleton calendar credential.
  - Mitigation: phased migration with compatibility fallback during rollout window.

## 15) Open Questions (Tracked for Subsequent Auth Phases)

- Email verification and password reset provider choice (Resend/Postmark/etc.).
- Redis introduction timing (immediate vs deferred until session load justifies it).
- Exact agent scope taxonomy and whether any scope implies transitive permissions.
- UI/UX constraints for membership/invite management in initial release.
