# Current Task: TASK-076 Multi-User Boundary Transition (DB + R2 + Google Calendar)

## Task ID
TASK-076

## Status
In Progress (Current) (2026-02-22)

## Objective
Enforce principal-scoped ownership boundaries end-to-end so project/task/context-card/attachment/calendar access is user-aware by default, with no singleton credentials and no cross-user data visibility.

## Locked Decisions (Do Not Re-open During Implementation)
- Data reset policy:
  - Staging/prod test data can be dropped.
  - No legacy compatibility layer, no backfill scripts, no phased fallback.
  - Use strict fail-closed behavior after migration (`missing ownership` => reject).
- Session/auth model:
  - Keep server stateless as much as possible.
  - Users: DB-backed sessions (`User`/`Session`) resolved per request from secure cookie token.
  - Agents (later TASK-059): scoped API credentials + short-lived JWT access tokens.
- Canonical identity source:
  - Authorization must use server-validated session user id only.
  - Never trust client-provided `userId` for permission checks.
- R2 ownership model:
  - Start fresh with ownership-aware keys from day 1.
  - No legacy key reads.
  - Recommended key prefix: `v1/{userId}/{projectId}/...`.
- Google Calendar model:
  - One calendar per user.
  - No singleton/default shared credential.
  - User connects via OAuth and app uses Google `primary` calendar only for now.
  - Do not introduce calendar picker/multi-calendar selection in TASK-076.

## Why Now
- TASK-045 established auth schema primitives (`User`/`Session`), but data access and integrations are still mostly project-id scoped.
- Full route protection (TASK-046) and sharing model (TASK-058) are unsafe without ownership boundaries at service/storage/integration layers.
- Current Google Calendar integration still relies on global credential assumptions, which conflicts with the multi-user target.

## Scope
- Database authorization boundaries:
  - Introduce principal-aware service-layer reads/writes for projects, tasks, context cards, and attachments.
  - Add project ownership/membership linkage required for private-by-default access.
  - Ensure non-owner/non-member access paths return not-found/forbidden consistently.
- R2 storage boundaries:
  - Bind attachment metadata and object-key strategy to project/user ownership boundaries.
  - Enforce authorization checks before issuing signed download URLs.
  - Preserve compatibility for local storage provider in development.
- Google Calendar boundaries:
  - Replace singleton credential resolution with user-scoped OAuth credential lookup.
  - Ensure calendar CRUD uses the current principal identity, not a global fallback.
  - Define clear behavior for users without calendar linkage.
- Migration and rollout safety:
  - Keep migration strategy simple due explicit data reset policy.
  - Keep implementation staged and testable in preview/staging before production merge.

## Google OAuth Clarification
- App-level Google OAuth client id/secret is configured once in your Google Cloud project.
- All users authenticate through the same OAuth app; each user grants consent with their own Google account.
- Client id/secret identifies your app to Google APIs; it is not tied to one end user calendar.
- Per-user access is determined by each user OAuth grant/token pair stored in app DB.

## User Inputs Required (Owner Preparation)
- Confirm data reset authorization for staging/prod test data before implementation starts.
- Ensure Google Cloud OAuth app is configured:
  - Valid redirect URI(s) for local + preview + production.
  - Calendar scopes approved.
  - Offline access enabled (refresh token issuance).
- Confirm one-calendar policy:
  - Locked: always use Google `primary` calendar.
- Env hygiene for calendar:
  - Do not keep personal email calendar ids in env for shared environments.
  - Keep `GOOGLE_CALENDAR_ID` unset (preferred) or set to `primary` only.

## Implementation Checklist (Execution Order)
1. Branch and setup:
   - Create `feature/task-076-multi-user-boundaries` from `main`.
   - Verify staging env variables for Supabase and R2 are active in local + preview.
2. Schema and persistence boundaries:
   - Add/confirm project ownership/membership schema required for private-by-default access.
   - Apply migrations to staging.
   - Hard reset test data as agreed (DB + R2).
3. Service-layer authorization:
   - Thread `actorUserId` through project/task/context/attachment services.
   - Enforce principal-scoped filtering on reads and writes.
   - Return consistent not-found/forbidden behavior for unauthorized access.
4. R2 boundary enforcement:
   - Generate ownership-aware object keys (`v1/{userId}/{projectId}/...`).
   - Enforce authorization check before signed URL issuance and delete.
   - Persist uploader/ownership metadata needed for audits and checks.
5. Google Calendar user scoping:
   - Replace singleton credential resolution with per-user credential lookup.
   - Ensure calendar CRUD uses `actorUserId` credential mapping.
   - Keep calendar target as `primary` for each connected user.
   - Add clear UX/error states for users without connected calendar.
6. Tests:
   - Add service/API regression tests for cross-user denial and owner success cases.
   - Add tests for R2 signed URL authorization and unauthorized denial.
   - Add tests for Google Calendar per-user credential isolation behavior.
7. Validation:
   - Run lint/test locally.
   - Open PR and monitor checks + preview deploy.
   - Manually verify with two users: no cross-user project/task/attachment/calendar visibility.
8. PR governance:
   - Address Copilot comments directly on threads.
   - Resolve conversations after implementation.
   - Keep PR scope to TASK-076 only.

## Out of Scope
- Public API exposure and external API key productization.
- Full project-sharing invitation UX (TASK-058 UI flows).
- Non-essential visual polish unrelated to ownership/auth boundaries.

## Acceptance Criteria
- A user can only access their own projects/resources unless explicitly authorized by membership.
- Service-layer queries/mutations enforce principal scope for project/task/context-card/attachment operations.
- R2 signed URL issuance and object metadata/key ownership checks are principal-aware.
- Google Calendar operations are user-scoped and no longer rely on singleton credentials.
- Regression tests cover authorization boundary success/failure paths for critical APIs/services.
- `tasks/backlog.md`, ADR references, and implementation notes stay aligned with delivered scope.
- Staging reset strategy is executed (no legacy data compatibility path retained).

## Definition of Done
- Dedicated feature branch and PR for TASK-076 only.
- CI checks pass and preview deployment is validated.
- Copilot review comments handled directly in PR threads; conversations resolved after implementation.
- Manual validation confirms no cross-user leakage for DB resources, R2 attachments, and calendar data.
- Task tracking updated (`tasks/current.md` and `tasks/backlog.md`) before handoff.
- Implementation reflects locked decisions above (stateless session pattern, strict principal scope, no legacy fallbacks).

## Next Step
Open PR for `feature/task-076-multi-user-boundaries`, monitor CI and Copilot review threads, resolve any comments, and trigger manual preview deploy after checks pass.

---

Last Updated: 2026-02-23
Assigned To: User + Agent
