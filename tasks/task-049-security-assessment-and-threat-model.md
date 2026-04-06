# TASK-049 Security Baseline Phase 1 - OWASP-Focused Assessment and Threat Model

## Task ID
TASK-049

## Status
Assessment completed on 2026-04-05; awaiting user review and TASK-050
remediation execution.

## Refresh Status
- Refreshed on 2026-04-05 after `TASK-061` / PR `#116` was confirmed merged into
  `main`.
- Result: the assessment remains valid on the merged baseline; no ranked
  finding changed severity or dropped out after the dependency/workflow refresh.

## Objective
Perform a grounded OWASP-oriented security assessment of the current NexusDash
application, capture the real attack surface and trust boundaries from the
implemented codebase, and produce a ranked finding list that can drive
`TASK-050` without guesswork.

## Assessment Method
- Reviewed the implemented security surface across auth/session handling,
  authorization, collaboration, agent access, attachments/storage, rich-text
  rendering, runtime config, and CI/CD workflows.
- Treated repo code and runbooks as the source of truth instead of relying on
  backlog phrasing alone.
- Prioritized concrete exploit paths and operational assumptions over generic
  checklist noise.
- Did not perform live exploit testing or production traffic analysis in this
  task; this is a code-and-runtime-posture assessment.

## Threat Model Snapshot

### High-Value Assets
- Human session tokens and authenticated workspace access
- Project-scoped agent API keys and short-lived bearer tokens
- Project data, attachments, and collaboration boundaries
- Calendar credentials and other third-party integration secrets
- Runtime secrets and deployment workflow trust
- Security audit trail quality

### Relevant Actors
- Anonymous internet user probing public auth/token endpoints
- Authenticated human user with valid session cookies
- Authenticated collaborator with `viewer`, `editor`, or `owner` role
- Agent client holding a project API key or bearer token
- Operator or attacker with log/database read access

### Primary Trust Boundaries
- Browser session cookie -> human route/API access
- Project API key -> bearer-token exchange -> scoped agent API access
- Human/project role checks -> service-layer authorization -> RLS-backed data access
- Attachment metadata -> storage-key lineage -> signed/proxied file access
- Request origin / trusted origin resolution -> email/OAuth callback links
- GitHub Actions / Vercel env wiring -> preview vs production runtime behavior

## Positive Controls Confirmed
- Project-scoped authorization is enforced in services, not only in route
  adapters, and protected queries are generally executed under actor-scoped RLS
  context.
- Password reset tokens, email verification tokens, and long-lived agent API
  key secrets are stored hashed and treated as single-use or scoped secrets.
- Rich-text content is sanitized before storage/rendering, and the read path
  re-coerces content through the sanitizer before `dangerouslySetInnerHTML`.
- Attachment download/finalize/delete flows validate project ownership and
  storage-key lineage instead of trusting client-provided keys alone.
- Runtime env validation is stronger than average: database split/TLS checks,
  trusted-origin rules, grouped env validation, and secret-length constraints
  all fail fast at startup.
- Redirect targets are normalized to in-app paths, closing common open-redirect
  variants on auth/logout/verification flows.

## Ranked Findings

### 1. High - Internet-facing auth and token-exchange paths still lack a real abuse-control baseline
- Affected areas:
  - `app/home-auth-actions.ts`
  - `lib/services/credential-auth-service.ts`
  - `app/api/auth/agent/token/route.ts`
  - `lib/services/project-agent-access-service.ts`
- What is happening:
  - Email/password sign-in and sign-up have validation but no IP/session/device
    rate limiting.
  - The public agent API-key exchange route also lacks throttling.
  - Failed agent token-exchange attempts are not written to the audit trail, so
    brute-force or spray activity has little in-product visibility.
  - Password reset and verification flows do have per-user cooldowns, which is
    good, but the overall abuse-control story is still incomplete at the public
    perimeter.
- Why it matters:
  - This leaves the app exposed to credential stuffing, password brute-force,
    token-exchange abuse, and avoidable compute amplification on secret-verify
    paths.
  - It also weakens incident detection because failed attack traffic is not
    surfaced in the current audit model.
- Recommended remediation direction:
  - Expand `TASK-064` scope into a real perimeter abuse-control baseline for
    sign-in, sign-up, forgot-password, verification resend, and
    `/api/auth/agent/token`.
  - Add failed-auth / failed-token-exchange telemetry with bounded metadata.
  - Prefer rate limits keyed by IP plus account identifier where relevant, with
    conservative fail-closed behavior on obvious abuse.

### 2. Medium - Human session tokens are stored in plaintext at rest
- Affected areas:
  - `lib/services/session-service.ts`
- What is happening:
  - Session creation generates a random token and stores that raw token
    directly in the `Session` table.
  - Session lookup resolves users by querying with the raw token value.
- Why it matters:
  - Any database read exposure immediately becomes active session theft, not
    just a confidentiality leak.
  - This is notably weaker than the current handling of password-reset tokens,
    email-verification tokens, and agent API-key secrets, which are hashed at
    rest.
- Recommended remediation direction:
  - Move to hashed session-token storage with compatibility migration support.
  - Resolve sessions by hashing the presented cookie token before lookup.
  - Rotate or invalidate legacy plaintext-backed sessions once the migration is
    complete.

### 3. Medium - Agent bearer tokens survive per-credential rotate/revoke until TTL expiry
- Affected areas:
  - `lib/auth/agent-token-service.ts`
  - `lib/auth/api-guard.ts`
  - `lib/services/project-agent-access-service.ts`
- What is happening:
  - Short-lived bearer tokens are signed JWT-like artifacts that encode
    credential/project/scope data and are accepted purely by signature and
    expiry validation.
  - Per-credential rotate/revoke updates the database secret/public id for
    future exchanges, but already-issued bearer tokens are still honored until
    their `exp` time.
  - Request-usage logging updates the credential record, but does not reject a
    revoked credential during bearer-token use.
- Why it matters:
  - If a bearer token is leaked shortly before credential rotation or
    revocation, the attacker keeps project access for the remaining token TTL.
  - The TTL is intentionally short, which limits blast radius, but this is
    still a real revocation-gap worth closing for an agent-facing API.
- Recommended remediation direction:
  - Add credential liveness/version checks during bearer-token use, or encode a
    revocation/version claim that is validated against current credential state.
  - Keep the short TTL even after the revocation gap is fixed; it is still good
    defense in depth.

## Lower-Priority Follow-Ups
- Browser security headers are not yet a defined baseline. There is no clear
  repo-level CSP/HSTS/frame-ancestors policy today, which means current XSS
  prevention relies mostly on input sanitization and framework defaults.
- Security event visibility is still weighted toward successful/handled paths.
  Failed-auth and suspicious-volume monitoring should become part of the
  broader abuse-control work rather than staying implicit.
- Dependency-security scan cadence is now in better shape after `TASK-061`, so
  supply-chain baseline monitoring should be treated as covered operationally,
  not as an open primary finding from this task.

## Residual Risks / Intentional Decisions
- Preview and other non-live-production environments intentionally relax
  verified-email behavior:
  - server/API verified-email gates only enforce on live production
  - preview email/password signups are intentionally auto-verified per
    `adr/decisions.md`
- That is acceptable only if preview data, preview users, and preview-linked
  integrations are treated as a lower-trust environment and never confused
  with production security guarantees.
- Agent request usage is logged in a fail-closed way. That preserves audit
  integrity, but it also means database/audit issues can reduce agent API
  availability.

## TASK-050 Candidate Scope
1. Implement perimeter abuse controls and failed-auth telemetry for public auth
   and token-exchange endpoints.
2. Hash human session tokens at rest and migrate the lookup model safely.
3. Close the agent bearer-token revocation gap so rotate/revoke has immediate
   effect on issued access where intended.
4. If bandwidth remains after the above, define a browser-header hardening
   baseline as a secondary defense-in-depth slice.

## Suggested Severity / Priority Order
1. Abuse controls and auth/token-exchange telemetry
2. Session token hashing at rest
3. Agent bearer-token revocation semantics
4. Browser security header baseline

## Evidence Base
- Auth/session:
  - `lib/auth/api-guard.ts`
  - `lib/auth/server-guard.ts`
  - `lib/auth/session-user.ts`
  - `lib/services/session-service.ts`
  - `lib/services/credential-auth-service.ts`
  - `lib/services/email-verification-service.ts`
  - `lib/services/password-reset-service.ts`
- Authorization/collaboration:
  - `lib/services/project-access-service.ts`
  - `lib/services/project-collaboration-service.ts`
- Agent access:
  - `app/api/auth/agent/token/route.ts`
  - `app/api/projects/[projectId]/agent-access/**`
  - `lib/auth/agent-token-service.ts`
  - `lib/services/project-agent-access-service.ts`
- Attachments / rich content:
  - `lib/services/project-attachment-service.ts`
  - `components/rich-text-content.tsx`
  - `lib/rich-text.ts`
- Runtime / deploy:
  - `lib/env.server.ts`
  - `lib/http/request-origin.ts`
  - `.github/workflows/quality-gates.yml`
  - `.github/workflows/deploy-vercel.yml`
  - `docs/runbooks/vercel-env-contract-and-secrets.md`
  - `docs/runbooks/database-connection-hardening.md`

## Validation Status
- No test or build commands were required for this pass because the task output
  is an assessment/report rather than executable code.
- Evidence was gathered through direct code and workflow review in the current
  branch checkout.
- The report was rechecked once more after the merged `TASK-061` baseline was
  present on local `main`; no reassessment-level rerun was required.

---

Last Updated: 2026-04-05
Assigned To: User + Agent
