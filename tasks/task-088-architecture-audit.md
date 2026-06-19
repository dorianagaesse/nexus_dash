# TASK-088 Architecture and Security Audit

Date: 2026-06-19
Scope: repository architecture, persistence, tenancy, authentication,
authorization, storage, deployment, operations, and delivery controls
Decision: continue normal feature delivery with bounded security follow-ups

## Executive Decision

NexusDash does not need a project-wide architecture pause.

The implemented architecture has credible production-oriented foundations:

- route and UI layers are prevented from importing Prisma directly;
- business and authorization rules are concentrated in service modules;
- core project data uses PostgreSQL row-level security with transaction-local
  actor context;
- runtime and migration database identities are separated and validated;
- human sessions and project-scoped agent credentials use distinct,
  explicit authentication paths;
- object storage, email dispatch, health probes, structured logging, request
  correlation, staged deployment, and rollback behavior have dedicated
  abstractions or runbooks;
- CI runs lint, unit/API tests, coverage, production build, Playwright smoke
  tests, and container-image construction.

The audit found one material architecture-verification gap rather than evidence
of a broken design: RLS coverage is not classified for every project-derived
table, and CI does not continuously prove cross-tenant denial as the production
least-privilege runtime role. TASK-318 should be completed near the front of the
architecture/security queue.

Validation also found a current high-severity dependency advisory in Prisma's
dev-tooling Hono chain. The affected packages are marked dev-optional and are
not part of the NexusDash request runtime, but the repository security-audit
command is red. TASK-319 owns restoring that baseline. Neither finding requires
stopping unrelated feature work.

## Audit Method

This review inspected implementation and configuration evidence rather than
inferring maturity from directory names or documentation alone.

Primary evidence included:

- `eslint.config.mjs`
- `app/api/**/route.ts`
- `app/**/actions.ts`
- `lib/auth/**`
- `lib/services/**`
- `lib/services/rls-context.ts`
- `lib/env.server.ts`
- `lib/storage/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/deploy-vercel.yml`
- `.github/workflows/notification-email-dispatch.yml`
- `docs/runbooks/**`
- the existing backlog and completed architecture/security tasks

This is a repository audit, not a penetration test or an independent review of
the live Supabase, Vercel, Cloudflare, Resend, or GitHub organization settings.
Platform configuration is treated as verified only where repository validation,
workflow configuration, or recorded runbook evidence supports it.

## Findings

### 1. Application boundaries

Assessment: strong

Evidence:

- ESLint rejects direct `@/lib/prisma` imports from `app/**`, `components/**`,
  and non-service `lib/**` modules.
- API routes delegate persistence and business operations to `lib/services/**`.
- Project services perform role and agent-scope checks close to the business
  operation, rather than relying only on UI visibility.
- `requireApiPrincipal` creates an explicit human-or-agent principal boundary.

Residual risk:

- `lib/services/**` is a broad trust boundary. Any service can import Prisma, so
  review discipline and tests remain important.
- Several service modules are large. TASK-102 already tracks the clearest
  modularization pressure in project collaboration.

Decision: no new task required.

### 2. PostgreSQL persistence and tenant isolation

Assessment: strong control design, incomplete continuous verification

Verified strengths:

- `withActorRlsContext` wraps actor-scoped work in a transaction and sets
  `app.user_id` with transaction-local `set_config`.
- Core project tables have explicit `ENABLE ROW LEVEL SECURITY` and
  `FORCE ROW LEVEL SECURITY` migrations.
- Later project features such as invitations, relations, comments, epics,
  roadmap data, notifications, activity events, and meeting notes added RLS
  migrations alongside their schemas.
- Production environment validation requires the transaction-pooled
  `app_runtime` role for `DATABASE_URL` and rejects that role for migration
  traffic.

Verification gap:

- `withActorRlsContext` bypasses database context setup when
  `NODE_ENV === "test"`, which is reasonable for isolated unit tests but means
  those tests do not execute PostgreSQL policies.
- the Quality Gates PostgreSQL service and test URLs use the `postgres`
  superuser, so the E2E suite does not represent the production
  non-`BYPASSRLS` identity;
- some project-derived models, including `TaskCommentReaction`, agent
  credential/audit records, and notification-email orchestration records, do
  not have an explicit RLS decision recorded next to their schema lifecycle.
  Their services currently apply authorization and constrained query logic,
  but the database defence-in-depth boundary is less explicit than it is for
  the core project tables.

Risk:

- Severity: medium.
- Likelihood today: low, because service-level checks are present.
- Impact if architectural drift occurs: high, because a future direct or
  insufficiently constrained service query could cross a project boundary.

Decision: create TASK-318. Do not pause unrelated feature delivery, but require
TASK-318 before declaring tenant isolation continuously verified.

### 3. Human authentication and session lifecycle

Assessment: strong

Evidence:

- session tokens are random, stored as hashes, checked for expiry, and
  revocable;
- primary session cookies are HTTP-only, `SameSite=Lax`, secure in production,
  path-scoped to `/`, and have explicit expiry/max-age;
- password reset and email verification use dedicated services and persisted
  tokens;
- Google and GitHub social authentication integrate with the same account and
  session model;
- Google Calendar authorization is a separate user-scoped integration and
  should not be confused with social sign-in.

Residual risk:

- custom authentication code carries long-term maintenance responsibility;
- this repository review did not perform live cookie, OAuth-provider, or session
  fixation testing.

Decision: no new architecture task. Continue treating auth changes as
security-sensitive and require focused regression coverage.

### 4. Agent authentication and authorization

Assessment: strong

Evidence:

- project API credentials exchange raw keys for short-lived signed access
  tokens;
- agent tokens carry project and scope constraints;
- API routes resolve human and agent principals through a shared guard;
- project services enforce required agent scopes in addition to project access;
- credential use, rotation, revocation, and failed exchange activity are
  recorded;
- agent token exchange uses persistent abuse-control buckets keyed by relevant
  signals.

Residual risk:

- the credential and audit tables need an explicit RLS/exemption decision under
  TASK-318;
- scope additions must continue to update API, service, onboarding, and test
  contracts together.

Decision: no separate task beyond TASK-318.

### 5. Environment and secret controls

Assessment: strong

Evidence:

- server configuration is centralized in `lib/env.server.ts`;
- application layout invokes runtime validation;
- production database URLs must use TLS, matching Supabase project references,
  separate runtime/admin endpoints, the transaction pooler for runtime traffic,
  and the least-privilege runtime role;
- R2, email, OAuth, scheduler, and agent-signing configuration have validation
  and deployment runbooks;
- migration traffic is separated from application runtime traffic in the
  deployment workflow.

Qualification:

- a few intentional `process.env` reads remain for test/runtime mode and build
  metadata. The claim that all raw environment access is eliminated would be
  inaccurate.

Decision: no new task required.

### 6. Attachment storage

Assessment: strong

Evidence:

- `StorageProvider` isolates storage behavior;
- local and Cloudflare R2 providers implement the same contract;
- production configuration requires R2 credentials as a coherent set;
- direct-upload, signed URL, cleanup, and download behavior are owned by the
  attachment service instead of UI components.

Residual risk:

- live bucket policy, lifecycle, recovery, and provider-account configuration
  are outside this repository audit.

Decision: no new task required.

### 7. Background work and notification scheduling

Assessment: acceptable intentional trade-off

Evidence:

- notification email work is persisted and claimed through an app-owned durable
  queue;
- the protected dispatcher is a thin HTTP adapter;
- GitHub Actions triggers the dispatcher every 30 minutes;
- scheduler-lag information is emitted for operational review;
- runbooks explicitly document that GitHub scheduling is best effort.

The trigger is not a durable worker platform, but the durable state and
idempotency live in the application rather than in GitHub Actions. This limits
the failure mode to delayed triggering instead of lost business state.

Decision:

- do not create a duplicate task;
- TASK-063 already owns broader background-work extraction;
- revisit the trigger when delivery objectives, volume, or plan economics
  justify Vercel Cron, QStash, or a dedicated workflow provider.

### 8. Rate limiting and abuse controls

Assessment: adequate for sensitive auth paths, incomplete as a general API
control

Evidence:

- credential authentication, verification, password recovery, and agent token
  exchange use persisted abuse-control logic;
- general project APIs do not have one cross-cutting distributed rate-limit
  policy.

Decision:

- do not create a duplicate task;
- TASK-064 already owns the general API rate-limiting baseline;
- raise its priority when public API traffic, cost exposure, or abuse evidence
  increases.

### 9. Next.js caching and invalidation

Assessment: low current risk

Evidence:

- authenticated project and account layouts use dynamic rendering;
- live and health endpoints explicitly disable caching;
- server actions use `revalidatePath` for affected authenticated surfaces;
- realtime project and notification flows use SSE/polling reconciliation.

The audit did not find a concrete stale-data defect or uncontrolled cache
boundary. Moving invalidation into services would also couple framework cache
behavior to domain logic, so it should not be adopted as a blanket rule.

Decision: no new task. Add a focused task only when a reproducible cache
consistency defect or a deliberate cache architecture appears.

### 10. Observability and operations

Assessment: solid baseline, not a complete production SRE stack

Evidence:

- structured server logs serialize metadata and errors;
- request IDs are validated, propagated, and returned;
- liveness and database readiness endpoints exist;
- deployment, rollback, database, scheduler, and secret operations have
  runbooks;
- notification scheduling exposes domain-specific lag metrics.

Qualification:

- repository evidence does not establish external alerting, SLOs, trace
  aggregation, or incident paging;
- therefore “comprehensive observability” would be too strong. The correct
  description is an operationally useful baseline.

Decision: no immediate task from this audit. Add alerting/SLO work when usage
and support expectations justify an explicit reliability program.

### 11. CI/CD and release safety

Assessment: strong

Evidence:

- pull requests run lint, unit/API tests, a coverage gate, build, Playwright
  smoke tests, and a container-image build;
- deployment is staged and has explicit promote/rollback paths;
- dependency audits and Dependabot workflows are separated from product
  validation;
- product version policy is checked for release-impacting branches.

Residual risk:

- CI tenant-isolation tests currently use the database superuser. TASK-318 owns
  the correction.

Decision: no additional task beyond TASK-318.

### 12. Dependency security posture

Assessment: deployed runtime exposure not demonstrated, repository audit
baseline currently red

Evidence:

- `npm run security:audit` reports high-severity Hono advisories through
  `prisma -> @prisma/dev`, where `@prisma/dev` depends on
  `@hono/node-server` and its separate `hono` peer/dependency package;
- the affected lockfile entries are marked `devOptional`;
- NexusDash application code does not import Hono or expose the Prisma
  development server;
- the repository has scheduled dependency auditing and Dependabot automation;
- TASK-274 previously restored a green audit through dependency overrides, but
  newer advisories now cover the pinned Hono version.

Risk:

- direct deployed application exposure: low based on the current dependency
  path;
- development/CI tooling exposure and governance impact: medium until the
  advisory is remediated or the audit classification is corrected;
- leaving a known high advisory unexplained would weaken the dependency
  security baseline.

Decision: create TASK-319. Address it near-term, but do not freeze feature
delivery because the vulnerable package is confined to Prisma tooling in the
current tree.

## Risk and Action Summary

| Area | Risk | Action |
| --- | --- | --- |
| Service/transport boundaries | Low | Continue current pattern |
| Human auth/session lifecycle | Low | Maintain focused security review |
| Agent credentials/scopes | Low-Medium | Include credential tables in TASK-318 inventory |
| RLS coverage and CI proof | Medium | Execute TASK-318 near-term |
| Storage abstraction | Low | No change |
| Scheduler trigger | Low-Medium | Keep accepted trade-off; TASK-063 remains owner |
| General API rate limiting | Medium when traffic grows | TASK-064 remains owner |
| Cache invalidation | Low | No task without a concrete defect |
| Observability | Low-Medium operational maturity | Add SLO/alerting work when warranted |
| CI/CD | Low apart from RLS test identity | Correct through TASK-318 |
| Prisma/Hono tooling advisory | Medium governance/tooling risk | Restore green audit through TASK-319 |

## Final Recommendation

Continue shipping features.

Do not initiate a broad architecture refactor and do not pause the project for
the scheduler, caching, or service-layer topics identified here. The current
system has coherent boundaries and layered security controls.

Schedule TASK-318 as the next architecture/security checkpoint and complete it
before making stronger claims that every project-derived model and CI path is
protected by the same least-privilege tenant-isolation boundary used in
production. Resolve TASK-319 near-term to restore the dependency-security audit
baseline. Neither task requires a broad refactor or feature freeze.
