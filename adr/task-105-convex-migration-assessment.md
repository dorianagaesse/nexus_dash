# TASK-105 Convex Migration Assessment - Fit, Tradeoffs, And Migration Risk Review

Date: 2026-04-15
Status: Accepted

## 1) Recommendation

Do **not** migrate NexusDash from the current `Prisma + PostgreSQL +
Supabase-hosted Postgres` baseline to Convex at this stage.

Keep the current stack as the system of record, and revisit Convex only if the
product roadmap becomes decisively realtime-first and collaborative enough that
we are willing to replace:

- Prisma-owned schema and migration control
- PostgreSQL Row-Level Security as defense in depth
- the current DB-backed human session model
- the current service/query model built around relational data and SQL-backed
  enforcement

## 2) Executive Summary

Convex is attractive for NexusDash in one important area: the product has
pending work around live multi-user updates, and Convex's automatic realtime
query model would likely make that class of feature easier to build and reason
about than the current request/refresh-oriented architecture.

That said, the **current NexusDash backend is not merely "CRUD on a database."**
It is already shaped around relational PostgreSQL semantics, repository-owned
migrations, database-enforced RLS, DB-backed session persistence, invitation
and membership constraints, and a mix of service-layer guards plus DB-level
policy enforcement. A move to Convex would be a broad platform rewrite, not an
incremental swap of one persistence adapter for another.

The repo's strongest existing reasons to stay put are:

- the app already depends on real PostgreSQL RLS in production
- schema evolution is already owned in-repo through Prisma and SQL migrations
- auth and collaboration flows are tightly coupled to relational constraints
  and database-backed session state
- the current codebase already isolated persistence behind `lib/services/**`,
  which lowers future portability risk without discarding the current stack now

The main reason to revisit Convex later is **if NexusDash becomes primarily a
live collaborative workspace**, where automatic subscriptions, presence-style
updates, and low-friction reactive backend queries become more strategically
important than Postgres-native enforcement and SQL-led control.

## 3) Current Repo Reality

The implemented repository state matters more than theoretical platform pros.
Today NexusDash has all of the following:

### 3.1 Current Data And Runtime Baseline
- PostgreSQL is the canonical datastore and Supabase-managed Postgres is the
  default hosted target.
- Prisma schema and repository-owned migrations are the schema source of truth.
- The repo currently has 21 PostgreSQL migration directories under
  `prisma/migrations`.
- Runtime and migration DB credentials are split via `DATABASE_URL` and
  `DIRECT_URL`.

Evidence:
- `adr/task-056-data-platform-adr.md`
- `README.md`
- `prisma/schema.prisma`
- `docs/runbooks/database-connection-hardening.md`

### 3.2 Authorization And Isolation Are Already Dual-Layered
- Service-layer authorization exists across project-scoped operations.
- PostgreSQL RLS is enabled and forced on core user/project-scoped tables.
- RLS context is propagated through `withActorRlsContext()` via
  `set_config('app.user_id', ...)`.
- Later collaboration features built on top of that policy surface rather than
  replacing it.

Evidence:
- `lib/services/rls-context.ts`
- `tasks/task-085-postgresql-rls-staged-rollout.md`
- `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`
- `prisma/migrations/20260309113000_task085_rls_phase2_force/migration.sql`

### 3.3 The Domain Model Is Relational And Constraint-Oriented
- `Project`, `ProjectMembership`, and `ProjectInvitation` define collaboration.
- `Task`, `TaskRelation`, `TaskBlockedFollowUp`, and attachments form a graph
  with project-scoped ownership rules.
- `ApiCredential`, scope grants, and audit events add an agent-auth layer.
- Auth/session entities remain relational and DB-backed.
- Google Calendar credentials are user-scoped and tied to current auth
  semantics.

Evidence:
- `prisma/schema.prisma`
- `lib/services/project-access-service.ts`
- `lib/services/project-collaboration-service.ts`
- `lib/services/project-agent-access-service.ts`
- `lib/services/session-service.ts`

### 3.4 The Repo Is Not Realtime-First Yet
- The current product largely serves data through page loads, server actions,
  route handlers, and client refreshes.
- `TASK-118` explicitly tracks realtime collaboration updates as future work.
- This means realtime is a meaningful gap, but not the current architectural
  center of gravity.

Evidence:
- `tasks/backlog.md`
- `project.md`

## 4) Where Convex Would Help This Project

These are the places where Convex is a real improvement opportunity, not a
fantasy benefit list.

### 4.1 Realtime Collaboration And Freshness

Convex's strongest fit for NexusDash is live data propagation.

Official docs say Convex is "automatically realtime," with query dependencies
tracked so subscribed clients update automatically. Queries are also cached and
subscribable, while mutations run as transactions.

Why that matters here:
- `TASK-118` exists because the app currently has stale-state and
  manual-refresh friction during multi-user work.
- task boards, context cards, and project collaboration surfaces are natural
  subscription targets
- presence-adjacent UX becomes easier when live updates are native rather than
  bolted on later

For a future where shared project work is actively concurrent, Convex would
give NexusDash a more opinionated and lower-friction live data model than the
current request-oriented stack.

### 4.2 Simpler Reactive Read Model

Convex pushes backend reads into query functions that are immediately consumable
from its client libraries. That would likely reduce some of the bespoke loading
and invalidation decisions the current app carries in its route/component split.

Potential benefit areas:
- project dashboard live refresh
- task reorder and mutation feedback coherence across clients
- collaboration banners, invite counts, and live project summaries

### 4.3 Built-In Scheduling For Future Workflow Automation

Convex has first-class scheduled functions. That could become helpful for:
- reminders and deadline-driven follow-up
- future automation around roadmap/timeline features
- background maintenance that is currently deferred in `TASK-063`

### 4.4 Possible Backend Consolidation For Greenfield-Style Features

If NexusDash were earlier in its lifecycle, Convex could plausibly consolidate:
- database access
- reactive subscriptions
- scheduled backend jobs
- file storage primitives for some asset flows

That is a genuine platform advantage in greenfield collaborative apps.

## 5) Where The Current Stack Fits Better

These are the reasons the migration does **not** make sense now.

### 5.1 PostgreSQL RLS Is Already Carrying Real Security Weight

This repo already implemented and promoted PostgreSQL RLS in a staged rollout,
including forced RLS on project-scoped tables. That is not incidental
infrastructure; it is a core safety property.

Convex can absolutely enforce authorization in application code, but it does
not give NexusDash a drop-in equivalent to PostgreSQL RLS policy enforcement.
Migrating would mean:
- deleting the current DB-level defense-in-depth layer
- re-implementing all access guarantees in function code alone
- re-validating every protected path without the current SQL policy backstop

For this app, that is a security and verification cost, not just a refactor.

### 5.2 The Existing Data Model Is More Relational Than Convex-Ideal

Convex supports schemas, IDs, indexes, and document references, so this is not
about "Convex cannot model relationships." It can.

The issue is fit and cost:
- project ownership, memberships, and invitations are relational and policy-rich
- task relations are a graph-like cross-reference feature
- attachments and audit records carry ownership and lifecycle constraints
- auth/session and invite flows depend on uniqueness, expiry, replacement, and
  role semantics that map very naturally to SQL tables + migrations

NexusDash is not a simple feed/chat app where a document model is obviously
superior. It is a structured workspace with cross-entity constraints.

### 5.3 Prisma And Migration History Are Existing Assets

The repo deliberately chose repository-owned Prisma migrations to avoid tight
platform coupling. That choice has already paid off:
- schema history is readable and reviewable in Git
- RLS, grants, and policy SQL are explicit
- deployment flow already understands runtime vs migration credentials

A move to Convex would strand that investment. The migration cost is not just
data copy; it is losing the current schema-management contract.

### 5.4 Auth And Next.js Runtime Fit Are Better On The Current Stack

NexusDash currently uses:
- DB-backed human sessions
- email verification and password reset lifecycle
- owner-managed project agent credentials with short-lived bearer tokens
- Google OAuth for calendar integration

Convex Auth is currently documented as beta, and its own docs note that
authentication support for Next.js server components, API routes, middleware,
and SSR is under active development.

That is a poor fit for a repo that already relies heavily on Next.js App Router
server behavior plus established auth flows. Even if Convex auth eventually
becomes a strong fit, it is not the safest way to replace the current
well-defined human session + agent token architecture now.

### 5.5 The Current External-Service Shape Already Works

The app already integrates:
- Google Calendar APIs
- transactional email delivery
- Cloudflare R2-backed attachment storage
- route/action-level transport contracts

Convex actions can call external APIs, but moving these flows would still
require a broad re-architecture. There is no strong sign that the current pain
point is "our external API integration model is fundamentally broken."

### 5.6 The Biggest Current Convex Benefit Can Be Pursued More Cheaply

The strongest reason to adopt Convex is realtime. But the repo does not need a
full platform migration to improve realtime behavior.

Cheaper next steps exist:
- implement `TASK-118` on the current stack first
- evaluate targeted live-update options while keeping PostgreSQL as the system
  of record
- measure whether realtime is becoming central enough to justify replacing RLS,
  Prisma migrations, and the auth/session model

That path preserves learning without paying migration cost too early.

## 6) Detailed Comparison For NexusDash

### 6.1 Data Model And Query Shape
- Current stack advantage:
  - relational tables, SQL constraints, Prisma relations, and explicit
    migration review all align with the current domain.
- Convex advantage:
  - reactive query model and document references are ergonomic for live UI.
- Assessment:
  - slight to moderate advantage to the current stack for this repo today.

### 6.2 Authorization And Tenant Isolation
- Current stack advantage:
  - service-layer authorization plus PostgreSQL RLS.
- Convex advantage:
  - centralized function-level authorization is straightforward in concept.
- Assessment:
  - strong advantage to the current stack because NexusDash already depends on
    DB-level defense in depth and has invested in proving it.

### 6.3 Realtime And Live Collaboration
- Current stack advantage:
  - none structural beyond future extensibility.
- Convex advantage:
  - automatic subscriptions, cache coherence, consistent snapshots, and a
    collaboration-friendly default.
- Assessment:
  - strong advantage to Convex for future live collaboration work.

### 6.4 Background Jobs And Automation
- Current stack advantage:
  - already compatible with scheduled/deploy workflows and standard cron-style
    patterns.
- Convex advantage:
  - built-in scheduled functions are attractive for reminders and future job
    flows.
- Assessment:
  - moderate advantage to Convex, but not enough to outweigh the migration
    cost by itself.

### 6.5 Auth
- Current stack advantage:
  - working DB-backed sessions, established invite and verification flows,
    clear agent-token contract.
- Convex advantage:
  - potential long-term consolidation if the app were re-architected around its
    model.
- Assessment:
  - strong advantage to the current stack on current repo maturity and safety.

### 6.6 Storage And Attachments
- Current stack advantage:
  - existing `StorageProvider` abstraction with local + R2 flows and direct
    upload handling.
- Convex advantage:
  - built-in file storage exists, which could simplify some greenfield cases.
- Assessment:
  - neutral to slight current-stack advantage because the repo already solved
    this problem in a portable way.

### 6.7 Ops, Tooling, And Data Portability
- Current stack advantage:
  - plain PostgreSQL, Prisma migrations, SQL visibility, familiar export/debug
    model, and no new platform rewrite.
- Convex advantage:
  - managed backend ergonomics and built-in patterns.
- Assessment:
  - moderate advantage to the current stack for an already-shipping codebase.

## 7) Migration Scope If We Chose Convex Anyway

This would be a substantial rewrite, not a backend swap.

### 7.1 Data Layer Rewrite
- Re-express Prisma schema entities as Convex tables and document references.
- Rebuild indexes and relation traversal patterns.
- Replace existing Prisma queries and includes across service modules.

### 7.2 Security Model Rewrite
- Retire PostgreSQL RLS policies and SQL helpers.
- Re-implement access rules in Convex functions.
- Re-verify all project, membership, invitation, attachment, and calendar
  boundaries.

### 7.3 Auth Rewrite Or Hybrid Complexity
- Either replace the current DB-backed session model and surrounding auth
  flows, or keep auth elsewhere and introduce a split-brain auth/data model.
- Revisit the agent access design, token exchange, audit trail, and request
  usage semantics.

### 7.4 Integration Rewrite
- Re-thread Google Calendar, email, and attachment flows through Convex or keep
  a hybrid backend surface.
- Revisit API route/server action boundaries and their callers.

### 7.5 Data Migration
- Export users, projects, memberships, invitations, tasks, task relations,
  attachments, audit events, and calendar credential references.
- Define ordering, backfill, and rollback rules for production cutover.
- Reconcile attachment metadata and external object storage lineage.

### 7.6 Test And CI Rewrite
- Update unit/service tests that mock Prisma or rely on current route/service
  contracts.
- Rebuild any environment assumptions tied to PostgreSQL fixtures.
- Revalidate deployment, preview, and rollback workflows.

## 8) Major Migration Risks

### 8.1 Security Regression Risk
Removing the current PostgreSQL RLS layer would reduce defense in depth unless
function-level authorization is reimplemented perfectly and verified thoroughly.

### 8.2 Auth Boundary Drift
The app's human-session and agent-token model is mature enough that replacing
or hybridizing it could create subtle inconsistencies.

### 8.3 Domain Semantics Rewrite Risk
Invitation replacement, role transitions, scoped agent access, archived-task
semantics, and related-task constraints are all places where small mistakes
would be user-visible.

### 8.4 Platform Split Risk
A partial migration would likely leave the repo with:
- one system for auth or external integrations
- another for core data and subscriptions

That is operationally worse than the current design unless the realtime payoff
is overwhelming.

### 8.5 Opportunity Cost
The team could spend several tasks re-platforming instead of delivering:
- realtime updates directly
- roadmap/epic/todo/deadline features
- collaboration UX improvements

## 9) Better Near-Term Options Than A Full Migration

1. Keep PostgreSQL/Prisma as the system of record and execute `TASK-118`
   directly on the current stack.
2. Preserve the current service-layer portability boundary so future platform
   experiments remain possible.
3. Reassess only after realtime collaboration proves central enough to justify
   replacing the current data-security contract.
4. If we want Convex learning now, prototype it in an isolated non-critical
   feature or throwaway branch rather than as a production migration target.

## 10) Revisit Conditions

Reopen the Convex question if all or most of the following become true:

- live multi-user updates become a primary product differentiator, not a
  backlog nicety
- presence, collaborative editing, or low-latency shared state become frequent
  across the workspace
- the team is willing to move away from PostgreSQL RLS as a core enforcement
  layer
- the current Prisma migration and SQL-policy model becomes a delivery burden
  rather than an asset
- Convex auth and Next.js integration mature enough to cleanly replace the
  current browser-session and agent-token architecture

## 11) Final Conclusion

Convex is a **plausible future fit for a more aggressively collaborative,
realtime-first NexusDash**, but it is **not the right move for the current
codebase**.

The platform would solve one of the repo's meaningful future needs well:
realtime synchronization. But today the project gains more from preserving:

- its mature PostgreSQL authorization posture
- its Prisma-owned schema control
- its DB-backed session/auth model
- its already-working external integration boundaries

The recommendation is therefore:

- keep the current PostgreSQL/Prisma/Supabase baseline
- treat realtime as the core problem to solve, not "switch databases" as the
  default answer
- revisit Convex only if the product shifts hard toward always-live
  collaboration and the team is ready for a deliberate backend rewrite

## 12) Repo Evidence

- `project.md`
- `README.md`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `lib/services/rls-context.ts`
- `lib/services/project-access-service.ts`
- `lib/services/project-service.ts`
- `lib/services/project-task-service.ts`
- `lib/services/project-collaboration-service.ts`
- `lib/services/project-agent-access-service.ts`
- `lib/services/session-service.ts`
- `lib/services/calendar-service.ts`
- `lib/auth/api-guard.ts`
- `adr/decisions.md`
- `adr/task-056-data-platform-adr.md`
- `adr/task-020-modern-auth-authorization-adr.md`
- `tasks/task-085-postgresql-rls-staged-rollout.md`

## 13) External Sources Consulted

Official Convex documentation, accessed 2026-04-15:
- Functions: https://docs.convex.dev/functions
- Realtime: https://docs.convex.dev/realtime
- Schemas: https://docs.convex.dev/database/schemas
- Convex Auth: https://docs.convex.dev/auth/convex-auth
- Scheduled Functions: https://docs.convex.dev/scheduling/scheduled-functions
- File Storage: https://docs.convex.dev/file-storage
- Data Import & Export: https://docs.convex.dev/database/import-export
- Backup & Restore: https://docs.convex.dev/database/backup-restore

Official Supabase documentation, accessed 2026-04-15:
- Auth: https://supabase.com/docs/guides/auth
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Postgres Changes / Realtime: https://supabase.com/docs/guides/realtime/postgres-changes
- Prisma: https://supabase.com/docs/guides/database/prisma
- Branching: https://supabase.com/docs/guides/deployment/branching
