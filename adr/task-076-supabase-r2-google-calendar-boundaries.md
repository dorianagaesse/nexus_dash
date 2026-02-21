# TASK-076 Supabase, Cloudflare R2, and Google Calendar Multi-User Boundary ADR

Date: 2026-02-20
Status: Draft (Proposed)

## 1) Decision Summary

For multi-user readiness, enforce principal-scoped boundaries across all three external/stateful surfaces:

- Supabase/PostgreSQL: principal-scoped data access through service-layer authorization (ownership/membership), never ID-only access.
- Cloudflare R2: private bucket with authorization-gated signed URL issuance and user/project ownership metadata.
- Google Calendar: user-scoped OAuth credentials and token lifecycle; remove singleton/global credential model.

`TASK-076` is the integration-boundary transition step between schema bootstrap (`TASK-045`) and auth route protection rollout (`TASK-046`).

## 2) Why This ADR Is Needed

Current implementation has singleton and global assumptions that are incompatible with shared multi-user operation:

- `GoogleCalendarCredential` is singleton (`id = "default"`) in `prisma/schema.prisma`.
- Calendar auth/access service reads/writes a global credential (`lib/services/google-calendar-credential-service.ts`, `lib/google-calendar-access.ts`).
- Calendar API routes are globally scoped (`app/api/calendar/events/**`), with no principal/project authorization input.
- Attachment ownership metadata is incomplete for multi-user isolation (`TaskAttachment` / `ResourceAttachment` do not include uploader principal).

Without explicit boundaries, multi-user rollout risks cross-user data visibility and token ownership drift.

## 3) Scope and Non-Goals

In scope:
- Data authorization boundaries (project/task/resource/attachment).
- Storage ownership boundaries (R2 object keying, metadata, signed URL checks).
- Google Calendar credential ownership boundaries (OAuth + token lifecycle per user).

Out of scope:
- Public third-party API productization.
- Enterprise SSO/SAML.
- Replacing Prisma with Supabase REST for core app domain data.

## 4) Target Boundary Model

### 4.1 Principal Model

All protected operations require a resolved principal:

- `user` principal from Auth.js DB session.
- `agent` principal from scoped API credential/JWT model.

Service methods in `lib/services/**` accept principal context and enforce permissions there.

### 4.2 Supabase/PostgreSQL Boundary

- Prisma migrations remain canonical schema authority.
- Runtime database credential is least-privilege app role.
- Migration/admin credential is isolated from runtime credential.
- Project-scoped reads/writes require owner/membership constraints and role checks.

### 4.3 Cloudflare R2 Boundary

- Bucket remains private.
- App endpoints perform authorization before issuing signed upload/download URLs.
- Object keys become tenant-safe and project-aware (for example: `projects/{projectId}/users/{userId}/...`).
- Attachment rows include uploader principal (`uploadedByUserId`) and must align with object key ownership.
- Add orphan cleanup/audit path for object-vs-row drift.

### 4.4 Google Calendar Boundary

- Replace singleton `GoogleCalendarCredential` with user-scoped credential ownership.
- OAuth start and callback require authenticated principal binding.
- Callback may only upsert tokens for the same initiating principal.
- Calendar service resolves Google access tokens by principal, not by global ID.
- Calendar operations require both:
  - authorized principal in app,
  - valid Google scope/token for that principal.

## 5) Data Model Changes (Planned)

Minimum required:

- `Project.ownerId` + `ProjectMembership` (from auth roadmap) for principal-scoped authorization.
- `TaskAttachment.uploadedByUserId` and `ResourceAttachment.uploadedByUserId` (plus indexes).
- Replace `GoogleCalendarCredential` singleton with user-owned calendar credential model.

Recommended calendar model (initial):

- `GoogleCalendarConnection`
  - `id`
  - `userId` (FK `User`)
  - `providerAccountId` (Google subject/account identifier)
  - `accessToken` (nullable)
  - `refreshToken` (encrypted at rest)
  - `scope`
  - `expiresAt`
  - `calendarId` (default `primary`, user-overridable later)
  - `createdAt`, `updatedAt`, optional `revokedAt`

Constraint choice for first iteration:
- One active Google connection per user for lower complexity.
- Keep schema extensible for multiple connections per user later.

## 6) Service and API Refactor Plan

### 6.1 Supabase/DB Service Layer

- Require principal-aware service signatures for project/task/resource/attachment operations.
- Remove remaining ID-only access patterns.
- Add contract tests for forbidden cross-user and cross-project access.

### 6.2 R2 Storage Flows

- Include principal + project metadata in presign/finalize flows.
- Validate key-prefix ownership during finalize and download signing.
- Reject signed URL issuance when ownership/membership checks fail.

### 6.3 Google Calendar Flows

- Replace:
  - `findGoogleCalendarCredential()` -> `findGoogleCalendarCredentialByUser(userId)`
  - global token update/upsert with principal-scoped versions.
- Update OAuth endpoints:
  - `/api/auth/google` requires signed-in user.
  - callback validates state and principal binding before token persistence.
- Update calendar APIs to principal/project-aware boundaries (route shape can stay temporarily, but service checks must include principal and project authorization).

## 7) Migration Strategy

1. Add new schema fields/tables for ownership + user-scoped calendar credentials.
2. Backfill existing single-user data with bootstrap owner principal.
3. Migrate existing singleton Google credential into that bootstrap user.
4. Introduce principal-scoped service APIs and migrate callers.
5. Remove singleton credential paths after parity validation.

## 8) Security and Operations Requirements

- Encrypt refresh tokens at rest (not plain text storage).
- Keep OAuth state protections and bind initiation/callback to principal.
- Log auth/integration audit events with request ID + actor + target resource.
- Enforce credential separation:
  - app runtime DB role,
  - migration/admin DB role,
  - storage API credentials,
  - Google OAuth client credentials.

## 9) Acceptance Criteria for TASK-076 (Boundary Portion)

- No global/singleton Google credential read/write path remains.
- Calendar requests resolve against current user principal and fail closed when missing authorization.
- Attachment signed URL issuance is ownership/membership-guarded.
- Service-layer tests cover cross-user isolation for DB, storage, and calendar flows.
- Documentation reflects runtime vs migration credential boundaries and rotation expectations.

## 10) Tradeoffs

- More implementation steps and schema work now.
- Significantly lower risk of cross-user leakage and lower rework for TASK-046/TASK-058/TASK-059.
- Keeps server stateless while preserving revocation/control through DB authority.

