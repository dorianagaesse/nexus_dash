# TASK-051 Security Baseline Phase 3 - Verification, Retest, and Closure Report

## Task ID
TASK-051

## Status
Completed on 2026-04-13

## Objective
Verify that the remediation delivered in `TASK-050` actually closes the
high-priority findings from `TASK-049`, rerun the most relevant security and
regression checks, and produce a closure report that states clearly what is
verified, what remains residual risk, and what still needs follow-up.

## Why This Task Matters
- `TASK-049` established the ranked security findings, but a finding is not
  truly closed just because code changed.
- `TASK-050` intentionally chose concrete enforcement points:
  PostgreSQL-backed abuse controls, hashed human session storage, and
  request-time agent credential liveness checks.
- `TASK-051` is where we confirm those decisions hold up against the current
  codebase and validation surface instead of assuming the implementation is
  sufficient.

## Scope
- Reconcile the original TASK-049 findings with the final TASK-050
  implementation.
- Review the relevant code paths, migration, and tests for the remediation
  surface.
- Execute the validation baseline and targeted security-focused verification.
- Tighten tests or small implementation details only if verification exposes a
  real gap.
- Produce a written closure report with explicit residual risks and follow-up
  recommendations.

## Out Of Scope
- A new broad security redesign beyond the top-ranked TASK-049 findings.
- Unrelated auth feature work.
- Replacing the chosen PostgreSQL-backed abuse-control architecture unless
  verification proves it is fundamentally broken.
- Inventing production-only evidence that is unavailable from the current
  environment.

## Verification Areas
1. Abuse-control enforcement on sign-in, sign-up, forgot-password,
   verification resend, and agent token exchange.
2. Failed-attempt telemetry and audit visibility where TASK-050 intended it.
3. Hashed human session storage semantics and legacy-session invalidation.
4. Request-time rejection of revoked, rotated, expired, or inactive agent
   credentials.
5. Migration/runtime fit for the chosen schema and service changes.
6. Residual-risk items intentionally left outside TASK-050.

## Environment Assumptions
- Node/npm must be compatible with the current Prisma/Next toolchain.
- Unit/API/build validation should run locally if dependencies install cleanly.
- Full E2E coverage may remain blocked if the expected PostgreSQL fixture
  service is not reachable from this workstation session.
- GitHub CI evidence can be used to complement local verification where the
  local environment is narrower than the repo's intended validation surface.

## Acceptance Criteria
- Each top-ranked TASK-049 finding has a clear verification outcome backed by
  code review, tests, or command evidence.
- TASK-050 validation requirements are revisited and mapped to concrete current
  evidence.
- Any discovered verification gap is either fixed in this task or documented as
  an explicit residual issue with rationale.
- The closure report makes it easy to decide whether the security-baseline epic
  can be considered complete.

## Definition Of Done
1. Verification evidence exists for abuse controls, session hashing, and agent
   credential liveness.
2. Relevant validation commands have been run and recorded, with blockers noted
   precisely if any are environment-bound.
3. Tracking docs and the journal are updated to reflect the verification pass
   and closure decision.
4. `TASK-051` status in the backlog is updated based on the verification
   outcome.

## Verification Outcome

### Finding 1 - Public auth and token-exchange abuse controls
- Outcome: Closed on the current baseline.
- Evidence:
  - `lib/services/credential-auth-service.ts` now gates sign-in with
    `checkAuthAbuseControls()` and records failed attempts through
    `registerAuthAbuseFailure()`, while sign-up uses
    `consumeAuthAbuseQuota()`.
  - `app/forgot-password/actions.ts` and `app/verify-email/actions.ts` now
    apply DB-backed abuse controls while preserving enumeration-safe or stable
    user-facing behavior.
  - `lib/services/project-agent-access-service.ts` applies the same
    abuse-control model to `POST /api/auth/agent/token`, including failed
    token-exchange audit logging via `token_exchange_failed`.
  - Focused tests exist in `tests/lib/credential-auth-service.test.ts`,
    `tests/app/forgot-password-actions.test.ts`,
    `tests/app/verify-email-actions.test.ts`, and
    `tests/lib/project-agent-access-exchange.test.ts`.
- Assessment:
  - The original high-severity perimeter gap identified in TASK-049 is no
    longer present as a code-path omission.
  - Abuse control is authoritative across app instances because the state lives
    in PostgreSQL rather than memory.

### Finding 2 - Plaintext human session tokens at rest
- Outcome: Closed on the current baseline.
- Evidence:
  - `lib/services/session-service.ts` hashes session tokens for create, lookup,
    delete, and bulk revocation paths through `hashSessionToken()`.
  - `prisma/schema.prisma` now stores `Session.sessionTokenHash` instead of a
    raw token column.
  - Migration
    `prisma/migrations/20260410110000_task050_security_remediation/migration.sql`
    explicitly deletes legacy session rows before renaming the session-token
    column, preventing indefinite plaintext compatibility.
  - `tests/lib/session-service-storage.test.ts` verifies hashed lookup and
    hashed revocation semantics, and the E2E helpers were updated to seed hashed
    session tokens.
- Assessment:
  - Database-read exposure no longer directly yields active human session
    secrets on the current model.
  - The accepted one-time logout tradeoff remains explicit and correctly
    implemented.

### Finding 3 - Agent bearer tokens surviving rotate/revoke until TTL expiry
- Outcome: Closed on the current baseline.
- Evidence:
  - `lib/auth/api-guard.ts` forwards token `issuedAt` into
    `recordAgentRequestUsage()` for every agent-authenticated request.
  - `lib/services/project-agent-access-service.ts` now updates usage only when
    the underlying credential is still active, unexpired, unrevoked, and not
    rotated after the bearer token was issued.
  - `tests/lib/project-agent-access-service.test.ts` verifies the authorization
    gate shape used for request-time liveness enforcement.
  - `tests/lib/api-guard.test.ts` verifies that agent usage recording is part
    of principal resolution and that failures fail closed.
- Assessment:
  - Already-issued bearer tokens no longer rely only on signature plus `exp`;
    they are contingent on current credential state at request time.

## Validation Evidence

### Current Codebase Review
- `git diff --name-only a1bc590..HEAD -- lib app prisma tests README.md journal.md tasks adr`
  shows no drift in the TASK-050 security implementation after merge; only docs
  and the later TASK-120 work changed.
- `git diff --name-only a1bc590..HEAD -- ...security-critical files...`
  returned no differences.

### Preserved TASK-050 Validation Evidence
- From `journal.md` on 2026-04-10:
  - local validation passed for `npm run lint`, `npm test`,
    `npm run test:coverage`, `npx prisma generate`, and `npm run build`
    on a Node `20.19` runtime
  - preview connectivity was restored and revalidated after the Prisma TLS
    compatibility follow-up
- GitHub PR `#161` evidence:
  - `gh pr checks 161 --repo dorianagaesse/nexus_dash`
    - `check-name`: pass
    - `Quality Core (lint, test, coverage, build)`: pass
    - `E2E Smoke (Playwright)`: pass
    - `Container Image (build + metadata artifact)`: pass
  - `gh run list --repo dorianagaesse/nexus_dash --branch fix/task-050-security-remediation --limit 10`
    shows successful branch-scoped workflow runs for:
    - `Quality Gates` run `24243522704`
    - `Check Branch Name` run `24243522682`
    - `Deploy Vercel (CD + Rollback)` run `24242986947`
  - Copilot review on PR `#161` produced 7 comments, all addressed in follow-up
    commit `c4d1dea` and reflected in the merged branch state.

### Current Local Replay Attempt
- Attempted:
  - `npx vitest run tests/lib/session-service-storage.test.ts tests/lib/credential-auth-service.test.ts tests/app/forgot-password-actions.test.ts tests/app/verify-email-actions.test.ts tests/lib/project-agent-access-exchange.test.ts tests/lib/project-agent-access-service.test.ts tests/lib/api-guard.test.ts`
  - `npm install`
- Result:
  - local validation replay is currently blocked before test execution because
    this workstation is on Node `20.17.0`
  - Prisma 7 now requires Node `20.19+`, so `npm install` fails during Prisma's
    preinstall step
- Additional known blocker carried from TASK-050:
  - local Playwright execution still depends on a PostgreSQL fixture service at
    `127.0.0.1:5432`, which was not reachable in the earlier TASK-050 session

## Residual Risk And Follow-Up
- Lower-priority items called out in TASK-049 remain intentionally outside the
  scope of this closure pass:
  - browser security header baseline
  - broader suspicious-volume / failed-path monitoring ergonomics
  - future abuse-control evolution if PostgreSQL-backed buckets become too
    noisy under sustained attack
- Operational follow-up identified during TASK-051:
  - local setup docs were stale on Node minimums; `README.md` is now corrected
    to match the actual toolchain floor
- No new high-severity regression was found in the merged TASK-050 baseline.

## Closure Decision
- `TASK-051` closes the verification/retest/reporting phase for the
  TASK-049/TASK-050 security-baseline work.
- The three top-ranked TASK-049 findings are considered remediated and
  verified on the current repo baseline through code review, preserved local and
  CI evidence from TASK-050, and no-drift confirmation after merge.
- Remaining security work should flow through the broader hardening backlog
  rather than keeping the TASK-049/TASK-050/TASK-051 chain open.

## Planned Evidence Sources
- `tasks/task-049-security-assessment-and-threat-model.md`
- `adr/task-050-security-remediation-adr.md`
- `lib/services/auth-abuse-control-service.ts`
- `lib/services/credential-auth-service.ts`
- `lib/services/session-service.ts`
- `lib/services/project-agent-access-service.ts`
- `lib/auth/api-guard.ts`
- `prisma/migrations/20260410110000_task050_security_remediation/migration.sql`
- `tests/lib/**`, `tests/api/**`, `tests/app/**`, and `tests/e2e/**` related to
  the security baseline

## Planned Validation
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- targeted `vitest` runs around the TASK-050 remediation surface
- `npm run test:e2e` only if the PostgreSQL-backed fixture path is reachable in
  this environment

---

Last Updated: 2026-04-13
Assigned To: Agent
