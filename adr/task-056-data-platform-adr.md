# TASK-056 Data Platform ADR - PostgreSQL Baseline and Supabase Fit

Date: 2026-02-15
Status: Done

## 1) Decision

Adopt **PostgreSQL** as the application persistence baseline, and use **Supabase-managed Postgres** as the default hosted runtime target for production/staging.

The application contract remains **provider-agnostic at the app layer** (Prisma + SQL migrations owned in-repo), so moving to another managed Postgres provider later remains feasible.

## 2) Why This Decision

The roadmap needs:
- multi-user concurrency and stronger production durability than SQLite,
- remote access for dashboard + agents,
- manageable operations for a small team,
- a practical path to shipping without big infra overhead.

Supabase-managed Postgres gives a fast path to those goals while keeping core data model standards aligned with plain PostgreSQL.

## 3) Option Assessment

### Option A - Self-managed PostgreSQL (VM/container)
- Pros: maximal control, minimal vendor surface.
- Cons: highest ops burden (backups, failover, patching, monitoring, connection management).
- Verdict: not ideal for current delivery velocity.

### Option B - Generic managed PostgreSQL (no Supabase platform coupling)
- Pros: lower ops than self-hosted, moderate lock-in.
- Cons: still requires assembling several platform concerns (preview env, branch workflows, surrounding platform ergonomics).
- Verdict: viable fallback if Supabase constraints become limiting.

### Option C - Supabase-managed Postgres (selected)
- Pros: managed Postgres with integrated connection options, platform-level branching workflows, and fast setup for remote collaboration.
- Cons: potential platform coupling if we mix app concerns too early with provider-specific features.
- Verdict: best fit now, with explicit guardrails below.

## 4) Guardrails (Important)

To reduce lock-in and keep migrations safe:
- Keep Prisma schema + migrations as source of truth in repo.
- Use PostgreSQL-first SQL types/features that are portable when possible.
- Do **not** couple migration phase to auth/storage feature adoption.
- Treat Supabase extras (Auth/Storage/Edge) as later explicit decisions, not implicit defaults.
- Keep environment contracts explicit (`DATABASE_URL`, direct URL where needed for migrations).

## 5) Execution Guidance for TASK-057

1. Introduce PostgreSQL runtime parity for app behavior (no product concept changes).
2. Keep schema semantics equivalent during SQLite -> PostgreSQL migration.
3. Validate connection strategy for runtime vs migration paths.
4. Re-run contract tests and smoke flows before closing migration.

## 6) Risks and Mitigations

- Risk: hidden provider coupling.
  Mitigation: repository-owned migrations + provider-agnostic data layer policy.

- Risk: migration drift across environments.
  Mitigation: strict migration workflow and CI verification.

- Risk: connection-pool misconfiguration under concurrent load.
  Mitigation: document runtime connection policy and test with representative concurrency.

## 7) Follow-up

- TASK-057: execute SQLite -> PostgreSQL parity migration.
- TASK-020 and descendants: introduce auth/user ownership after database migration stability.

## 8) Reference Inputs

- SQLite guidance on concurrent writer limits and when to prefer client/server RDBMS:
  - https://www.sqlite.org/whentouse.html
- Supabase branching model and environment isolation:
  - https://supabase.com/docs/guides/deployment/branching
- Supabase + Prisma operational guidance (Supavisor/session vs transaction pooler):
  - https://supabase.com/docs/guides/database/prisma
- Prisma pooled connection + `directUrl` pattern for migrate commands:
  - https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-pg-bouncer
