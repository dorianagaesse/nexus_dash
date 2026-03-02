# Development Journal

This file is a concise execution log.
Use it for important implementation milestones, blockers, validation runs, and release evidence.

## Entry Format

- `Date`
- `Type`: `Execution` | `Planning` | `Validation` | `Governance` | `Blocker`
- `Summary`
- `Evidence`: commands, PR number, preview URL, or impacted files

## Recent Entries (Most Relevant)

### 2026-02-27
- Type: Execution
- Summary: TASK-086 implemented account email-change verification and compact account-page layout.
- Evidence: Added email update flow in `lib/services/account-profile-service.ts` (normalize/validate/unique + `emailVerified` reset + verification-token cleanup), wired `updateAccountEmailAction` in `app/account/actions.ts` to issue verification and redirect to `/verify-email`, redesigned `app/account/page.tsx` for denser identity/security sections with a header `Settings` CTA, and added regression tests in `tests/lib/account-profile-service.test.ts` and `tests/app/account-actions.test.ts`.

### 2026-02-27
- Type: Governance
- Summary: TASK-086 PR/checks/preview deployment completed with no Copilot review comments.
- Evidence: PR `#64`, checks green (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), manual preview deploy workflow run `22501955778` succeeded, preview URL: `https://nexus-dash-2iv983hoq-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-082 delivered authenticated account profile self-service and user-menu identity UX updates.
- Evidence: Added `/account` page + server actions (`app/account/page.tsx`, `app/account/actions.ts`), implemented `lib/services/account-profile-service.ts` (username mutation + password rotation with revocation of other sessions), centralized account policy rules in `lib/services/account-security-policy.ts`, updated account menu copy/actions, and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Governance
- Summary: TASK-082 PR opened and preview deployment validated.
- Evidence: PR `#60` (`feature/task-082-account-profile` -> `main`), deploy workflow run `22444607142` succeeded, preview URL: `https://nexus-dash-r4om5vt99-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-081 delivered username onboarding, discriminator identity, and signup confirm-password validation.
- Evidence: Updated auth service/actions/homepage signup UX, added Prisma migration `20260226113000_task081_username_identity`, added identity summary service + account-menu display (`username#suffix`), and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Blocker
- Summary: Local migration-apply validation could not be completed in this execution environment.
- Evidence: `npm run db:migrate` failed without `DIRECT_URL`, then failed again with local placeholder URLs due no running Postgres; Docker-based fallback could not run because Docker daemon socket was unavailable.

### 2026-02-24
- Type: Execution
- Summary: TASK-047 delivered signed-out home auth entry + credentials onboarding.
- Evidence: Added server actions in `app/home-auth-actions.ts`, password hash/verify services, `User.passwordHash` migration (`20260224223000_task047_email_password_auth`), and validated with `npx prisma generate`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`.

### 2026-02-24
- Type: Governance
- Summary: TASK-047 PR lifecycle completed and follow-up review comments resolved.
- Evidence: PR `#54`, follow-up commit `145da6e`, green checks (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), preview deployment: `https://nexus-dash-d65zx5w61-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-046 route/API auth protection implemented.
- Evidence: Added guards (`lib/auth/server-guard.ts`, `lib/auth/api-guard.ts`), protected `/projects/**` and `/account/**`, and added regression tests.

### 2026-02-23
- Type: Governance
- Summary: TASK-046 review/checks/preview deployment completed.
- Evidence: PR `#52`, preview deployment: `https://nexus-dash-2ahst74ap-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-080 delivered account menu + settings page + logout flow.
- Evidence: Added `/account/settings`, `/api/auth/logout`, account menu actions, and tests for settings/logout paths. PR `#50`, preview: `https://nexus-dash-7s1tprkyi-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-076 principal-scoped multi-user boundary implemented across DB, attachments, and calendar.
- Evidence: Added ownership/membership schema, actor-aware services, user-scoped Google credentials, ownership-aware storage keys (`v1/{userId}/{projectId}/...`), PR `#49`, preview: `https://nexus-dash-n5pw6dlxt-dorian-agaesses-projects.vercel.app`.

### 2026-02-20
- Type: Planning
- Summary: Auth/authz architecture locked and sequenced.
- Evidence: Added `adr/task-020-modern-auth-authorization-adr.md`; split boundary transition as TASK-076 before route protection.

### 2026-02-20
- Type: Execution
- Summary: TASK-062 dashboard decomposition completed.
- Evidence: Split large panels into `components/kanban/*`, `components/context-panel/*`, `components/calendar-panel/*`; validated with lint/test/coverage/build.

### 2026-02-18
- Type: Validation
- Summary: TASK-069 Cloudflare R2 smoke validation completed end-to-end.
- Evidence: Added gated smoke test `tests/lib/r2-smoke.test.ts` (`R2_SMOKE=1`), verified upload/download/delete + DB cleanup behavior.

### 2026-02-18
- Type: Planning
- Summary: Auth UX/sessions scope clarified for TASK-020/TASK-045/TASK-047 and later phases.
- Evidence: Updated backlog sequencing and acceptance criteria in `tasks/current.md` at that time.

## Historical Milestones (Condensed)

### 2026-02-11 to 2026-02-12: MVP foundation and UX iterations
- Docker setup stabilized (`APP_PORT` override, Prisma generation in container).
- Project CRUD and Kanban baseline implemented.
- Task detail/edit/rich-text flows added.
- Blocked task note and done-task auto-archive behavior added.
- Context card panel introduced and refined (collapse, colors, compact headers).
- Theme toggle and modal UX quality improvements shipped.

### 2026-02-13 to 2026-02-17: quality, architecture, and deployment baseline
- Attachment system matured (preview/download, then provider abstraction).
- API and UI regression coverage expanded.
- PostgreSQL migration baseline replaced legacy SQLite runtime.
- Layering enforced via service boundaries + lint restrictions.
- Runtime env hardening + runbooks added.
- CI quality gates + E2E + container build checks added.
- Vercel CD/promotion/rollback workflow established.

## Journal Usefulness

Helpful for development: **Yes**, if kept concise.

Most useful entries are:
- execution milestones tied to task IDs
- validation evidence (commands/checks)
- release evidence (PR + preview URL)

Low-value entries to avoid going forward:
- minor UI tweaks without task linkage
- repetitive step-by-step notes that already exist in PR history

### 2026-03-02
- Type: Execution
- Summary: ISSUE-070 targeted remediation implemented as low-risk performance patch set (no broad architecture rewrite).
- Evidence: Added bounded concurrency (`default=3`) and success callback support in `lib/direct-upload-client.ts`; extended uploader tests in `tests/lib/direct-upload-client.test.ts`; removed duplicate create-flow refreshes in `components/create-task-dialog.tsx` and `components/project-context-panel.tsx`.
