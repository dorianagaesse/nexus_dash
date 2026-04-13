# TASK-050 Security Remediation ADR

Date: 2026-04-10
Status: Accepted

## 1) Decision Summary

TASK-050 closes the top three findings from `TASK-049` by adding a
database-backed abuse-control baseline for public auth and token exchange,
hashing human session tokens at rest, and treating agent bearer tokens as
valid only while the underlying credential remains live at request time.

## 2) Context

- `TASK-049` ranked three concrete gaps above the rest of the security backlog:
  public auth/token abuse controls, plaintext human sessions at rest, and
  agent bearer revocation lag.
- The app runs in a stateless Next.js/Vercel-style model backed by PostgreSQL.
  Any mitigation that depends on per-instance memory would be inconsistent
  across requests and deployments.
- Existing auth controls already hash password-reset tokens, verification
  tokens, and agent API-key secrets, so plaintext session storage had become
  the weakest token-handling path.
- Agent access already relied on short-lived signed access tokens, but
  `TASK-049` correctly identified that rotate/revoke was only authoritative for
  future exchanges, not for already-issued bearer tokens.

## 3) Options Considered

### Option A - In-memory abuse throttling plus legacy session compatibility
- Pros:
  - Fast to add.
  - No database schema changes for rate-limit buckets.
  - Could preserve existing user sessions transparently.
- Cons:
  - Not authoritative across stateless app instances or preview/production
    scale-out.
  - Legacy plaintext session compatibility would preserve the at-rest theft
    risk until old rows naturally expired.
  - Harder to reason about and test consistently.
- Verdict:
  - Rejected.

### Option B - External cache/Redis abuse controls plus explicit session migration
- Pros:
  - Strong distributed rate limiting.
  - Good operational fit for high-volume traffic.
  - Could preserve future headroom if abuse-control complexity grows.
- Cons:
  - Introduces new infrastructure the repo does not currently require.
  - Expands TASK-050 from a remediation sprint into a platform change.
  - Adds setup and deployment coupling without first proving the baseline need.
- Verdict:
  - Deferred.

### Option C - PostgreSQL-backed abuse buckets, hashed sessions, request-time agent liveness checks
- Pros:
  - Fits the existing stateless + PostgreSQL architecture.
  - Makes abuse controls authoritative across all app instances.
  - Eliminates plaintext session storage immediately.
  - Makes rotate/revoke authoritative for already-issued bearer tokens without
    abandoning short token TTLs.
- Cons:
  - Adds database writes on abuse paths and agent requests.
  - Requires a one-time invalidation of legacy plaintext-backed human sessions.
  - Increases auth-path coupling to the database.
- Verdict:
  - Selected.

## 4) Decision

We selected Option C.

The implementation introduces `AuthRateLimitBucket` as the shared abuse-control
store keyed by scope plus hashed identifiers. Public auth and token-exchange
flows consume or check quota through that table rather than in-memory state.

Human session tokens are now hashed with SHA-256 before persistence and looked
up by hash on every authenticated request. Instead of carrying dual-format
session compatibility indefinitely, the migration explicitly deletes legacy
session rows so the weaker plaintext storage model does not survive the rollout.

Agent bearer tokens remain short-lived, but they are no longer accepted solely
by signature plus expiry. Request-time usage now requires the current
credential row to still be active, unexpired, unrevoked, and not rotated after
the bearer token was issued.

## 5) Consequences

- Technical impact:
  - Auth and token-exchange entry points now have shared abuse-control state in
    PostgreSQL.
  - Session persistence changes from raw token lookup to hashed-token lookup.
  - Agent request logging becomes the credential-liveness enforcement point.
- Operational impact:
  - Deploying the migration signs out existing human sessions once.
  - Failed sign-in and failed agent token exchange attempts gain structured
    telemetry and audit visibility without storing raw secrets.
  - Preview/production behavior stays aligned because the controls are DB-based.
- Risks and mitigations:
  - Risk: abuse-control writes could become noisy under sustained attack.
    Mitigation: use coarse fixed windows, hashed keys, bounded metadata, and
    keep the design simple enough to replace with Redis later if needed.
  - Risk: deleting legacy sessions causes a one-time user logout.
    Mitigation: document the behavior explicitly and prefer a clean cut over
    indefinite plaintext-session compatibility.
  - Risk: request-time credential checks add a DB dependency to every agent
    request.
    Mitigation: keep short TTLs, reuse the existing request-usage checkpoint,
    and fail closed if the credential state cannot be confirmed.

## 6) Rollout / Migration Plan

1. Add the auth abuse bucket schema and the new audit action.
2. Rename session storage to `sessionTokenHash` and delete legacy session rows
   during the migration.
3. Route sign-in, sign-up, password reset, verification resend, and agent token
   exchange through the shared abuse-control service.
4. Enforce credential liveness during authenticated agent request usage.
5. Validate the change set with lint, tests, coverage, build, CI, and preview
   deployment.

## 7) Validation Requirements

- Tests:
  - unit coverage for hashed session storage semantics
  - denial-path tests for auth abuse controls
  - denial-path tests for throttled agent token exchange
  - request-usage tests for revoked/rotated credential rejection
- Monitoring/health checks:
  - review failed sign-in and token-exchange telemetry shape
  - confirm preview deploy and CI remain green
- Manual verification:
  - ensure human sign-in/sign-up still work normally
  - ensure password reset and verification resend keep enumeration-safe UX
  - ensure rotated/revoked agent credentials fail immediately for reused bearer
    tokens

## 8) Links

- `tasks/current.md`
- `tasks/task-049-security-assessment-and-threat-model.md`
- `adr/decisions.md`
- `journal.md`
- `lib/services/auth-abuse-control-service.ts`
- `lib/services/session-service.ts`
- `lib/services/project-agent-access-service.ts`
- `prisma/migrations/20260410110000_task050_security_remediation/migration.sql`
