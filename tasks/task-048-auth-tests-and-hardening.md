# TASK-048 Authentication Implementation Phase 4 - Auth Tests and Hardening

## Task ID
TASK-048

## Status
Completed and user validated on 2026-04-04

## Objective
Validate the full authentication and authorization baseline through targeted
regression coverage, edge-case hardening, and security-oriented verification so
the existing auth stack is stable before broader security remediation begins.

## Why This Task Matters
- The auth stack now spans multiple connected flows: browser sessions,
  sign-in/sign-up, verified-email gating, password recovery, account settings,
  project sharing, and project-scoped agent access.
- Each delivered slice has local tests, but TASK-048 is where we check the
  seams between those slices and harden any fail-open or inconsistent behavior.
- This task reduces the chance that TASK-049/TASK-050 spend time rediscovering
  regressions that should have been prevented at the auth layer first.

## Current Baseline Confirmed In Repo
- Browser auth is session-cookie based with helper resolution in
  `lib/auth/session-user.ts`, guarded server entry in
  `lib/auth/server-guard.ts`, and API auth enforcement in
  `lib/auth/api-guard.ts`.
- Email verification and password recovery flows already exist, with dedicated
  route/action coverage under `tests/api/**` and `tests/app/**`.
- Project collaboration and project-scoped agent access are both implemented
  and already have service/API tests, but those systems increase the number of
  cross-flow auth boundaries worth rechecking together.
- There is already a meaningful auth test surface in `tests/lib/**`,
  `tests/api/**`, `tests/app/**`, and at least one auth-related Playwright
  spec, so this task should extend and tighten existing patterns rather than
  invent a parallel test strategy.

## Working Assumptions For This Task
- The accepted auth ADR remains the policy source of truth; this task should
  harden toward that contract, not redefine it casually.
- We should favor fail-closed behavior when identity, verification, invite
  ownership, or agent scope resolution is ambiguous.
- The task should prioritize high-value auth boundary regressions over broad,
  low-signal test volume.
- New hardening should stay targeted and comprehensible; this is not a license
  for auth architecture churn.

## Scope
- Audit high-risk auth/authz entry points and cross-flow boundaries.
- Add missing regression coverage for identified gaps in session, verification,
  invite, collaboration, and agent-protected behavior.
- Tighten fragile or inconsistent runtime behavior revealed by the audit.
- Document any residual risks or explicit follow-up items discovered while
  closing the task.

## Implemented In This Pass
- Added a non-consuming email-verification token validation step so the
  callback can reject signed-in account mismatches before burning the token.
- Hardened regression coverage around the verification callback, auth redirect
  normalization, and live-production email-verification enforcement failures in
  the API auth guard.
- Extended action/route coverage for `returnTo` normalization across sign-in,
  sign-up, verify-email resend, and logout flows.

## Out of Scope
- Major redesign of the auth model selected in TASK-020.
- New auth product features unrelated to regression coverage or hardening.
- Broad OWASP remediation outside auth/authz-specific findings.
- Replacing the current human session or agent token model.

## Audit Areas To Review First
1. Session resolution and protected-route enforcement
2. Verified-email gating and return-path handling
3. Password reset and sensitive-account action safety
4. Invitation acceptance boundaries and cross-user identity constraints
5. Human-versus-agent protected API behavior and fail-closed handling
6. Cross-project isolation and role/scope downgrade paths

## Acceptance Criteria
- The main auth/authz boundaries have regression coverage for both happy-path
  and denial-path behavior.
- Sensitive flows fail safely when tokens, sessions, invite identity, or agent
  scopes are missing, stale, revoked, or malformed.
- Hardening changes preserve intended product behavior for valid users.
- Validation passes locally to the extent supported by the current environment,
  with blockers documented clearly if any remain.

## Proposed Execution Plan
1. Inventory the current auth/authz surface and map the existing tests.
2. Identify the highest-risk gaps where behavior is untested, inconsistent, or
   too permissive.
3. Implement the minimum high-value hardening changes needed to close those
   gaps.
4. Extend regression coverage around the changed behavior.
5. Run the relevant validation commands and capture evidence.

## Likely File Ownership / Touch Points
- `lib/auth/**`
- `lib/services/**` for auth-adjacent enforcement helpers
- `app/api/auth/**`
- `app/**/actions.ts` for sensitive auth-related server actions
- `tests/lib/**`
- `tests/api/**`
- `tests/app/**`
- `tests/e2e/**` if the local environment supports it

## Validation Plan
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- targeted `vitest` runs for any auth-focused suites added or changed
- `npm run build`
- `npm run test:e2e` only if the environment supports the required local
  PostgreSQL-backed fixture path during this task

## Validation Status
- Passed on 2026-04-04:
  - `npx vitest run tests/api/auth-verify-email.route.test.ts tests/lib/email-verification-service.test.ts tests/lib/api-guard.test.ts`
  - `npx vitest run tests/app/home-auth-actions.test.ts tests/app/verify-email-actions.test.ts tests/api/auth-logout.route.test.ts`
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`
- Not run in this pass:
  - `npm run test:e2e`

---

Last Updated: 2026-04-04
Assigned To: User + Agent
