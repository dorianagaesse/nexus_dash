# ND-181 Durable Collaboration History

Date: 2026-09-18
Status: Accepted

## 1) Decision Summary

Project scoped activity events become the durable collaboration history.
`ProjectActivityEvent` gains display-safe actor, entity, summary, and change
snapshot columns; every mutation route across the nine project domains records
a typed event at the transport layer; a read-only, viewer-visible, cursor
paginated history endpoint exposes the durable surface; and a bounded retention
sweep prunes events older than one year from the existing notification-email
cron.

## 2) Context

- Why this decision is needed now: the collaboration refinement program needs a
  trustworthy "what happened here" surface. Until now, `ProjectActivityEvent`
  rows existed mainly to carry the SSE live-refresh payload: they stored a raw
  payload, an actor user id, and nothing a reader could render without joining
  live users and credentials that may already be gone or revoked.
- Current constraints:
  - Activity events are written inside the same RLS-bound transactions as the
    domain mutations, and the live-refresh contract (version bumps, payload
    passthrough) must keep working unchanged.
  - `ProjectActivityEvent` is FORCE RLS with SELECT/INSERT policies only; there
    is no runtime DELETE path, and maintenance jobs have no actor context.
  - Agents act through scoped credentials, so history must attribute them
    without leaking credential secrets and without an owner-only join.
  - Producers were inconsistent: several project mutations recorded nothing at
    all (comments deletions, attachments, membership changes, ownership
    transfer, project edits), so any reader would have shown partial history.
- Scope boundaries: this decision covers the project timeline surface
  (foundation, producers, API, retention, project view). Artifact-level History
  tabs inside task/context/meeting-note panels are deferred to ND-485.

## 3) Options Considered

### Option A - Extend `ProjectActivityEvent` with snapshot columns (selected)

- Pros: one event pipeline, one RLS model, one version marker; live refresh and
  durable history stay consistent by construction; producers keep the existing
  `recordProjectActivityEvent` call shape; migrations are additive.
- Cons: the table serves two purposes (transport payload + durable record), so
  the read path must deliberately exclude `payload`; snapshot columns are
  denormalized by design.
- Verdict: selected. The dual-purpose concern is handled by a dedicated history
  projection that never selects `payload`.

### Option B - Separate audit/history table per domain

- Pros: each domain stores exactly the fields it cares about.
- Cons: nine near-identical tables, nine RLS policies, nine pagination sources
  that cannot be merged into one ordered timeline without a UNION of unstable
  shapes; actor rendering duplicated per domain.
- Verdict: rejected. It multiplies schema and policy surface for no reader
  benefit.

### Option C - Full event sourcing with projections

- Pros: theoretically complete replayability.
- Cons: disproportionate rewrite of a mature transactional schema; the product
  needs a readable timeline, not replay; migration risk is high.
- Verdict: rejected.

## 4) Decision

What is selected and why:

- **Schema (additive)** - `ProjectActivityEvent` gains
  `actorKind` (`ProjectActorKind`), `actorCredentialId` (FK to `ApiCredential`,
  `ON DELETE SET NULL`), `actorDisplayNameSnapshot` (80), `entityDisplayNameSnapshot`
  (160), `summary` (280), and `changes` JSONB, plus indexes on
  `actorCredentialId` and `createdAt`. The snapshot columns are what make the
  record readable after a user leaves or a credential is revoked or deleted.
- **Recording contract** - events are recorded at the route layer through
  `recordProjectActivityEventVersion`, with a fixed vocabulary: domains
  `task | task-comment | context-card | meeting-note | epic | roadmap |
  attachment | membership | project`, actions
  `created | updated | deleted | moved | reordered | archived | unarchived |
  transferred`. Producers pass a bounded `changes` list and an entity display
  name; the service caps fields at 20, serializes values to strings truncated
  at 200 characters, drops before/after no-ops, and composes the summary as
  `<Action> <domain label> "<entity name>"` (280 max). Recording failures never
  fail the mutation.
- **Read surface** - `GET /api/projects/[projectId]/history` requires a
  principal, enforces `project:read` for agents and a viewer-minimum project
  role for everyone, returns `{ entries, nextCursor }` with `Cache-Control:
  no-store`, and selects a projection that excludes `payload`. Pagination is
  keyset over `(version, createdAt, id)` descending with a base64url composite
  cursor; the page size defaults to 25 and is clamped to 50. Malformed cursors
  return `400 invalid-cursor`.
- **Actor rendering** - each entry carries the stored actor snapshot enriched,
  when resolvable, by the display-safe project actor registry
  (`app.list_project_actors`): active humans and credentials read as assignable
  live summaries; unresolvable ones fall back to the snapshot with a
  non-assignable `inactive` / `revoked` status. Credential secrets never enter
  the response.
- **Retention** - events older than 365 days are pruned by
  `app.prune_project_activity_events(cutoff, batch_limit)`, a SECURITY DEFINER
  function (the table has no runtime DELETE policy and the sweep has no actor
  context), invoked in batches from the existing notification-email cron route
  and capped per run so the sweep cannot monopolize the connection.
- **Project view** - a collapsed-by-default Timeline panel on the project
  dashboard reads the endpoint on expand, renders actor, summary, timestamp,
  and bounded change chips, and pages with a cursor-backed Load more control.

## 5) Consequences

- Technical impact: one durable pipeline replaces ad hoc recording; any new
  project mutation route is expected to record an event, and gaps are visible
  in the timeline. History reads never expose transport payloads, so raw
  request bodies cannot leak through the read surface. Snapshot columns make
  history independent of live identity rows.
- Operational impact: the preview/production databases need the two additive
  migrations; the existing cron route now also prunes history, so its response
  reports the prune summary. Retention is fixed at one year by constant.
- Risks and mitigations: unreadable actor rows are mitigated by
  `ON DELETE SET NULL` plus snapshots and the non-assignable fallback status;
  runaway producer text is mitigated by the field/value/summary caps; the
  cron sweep touching RLS-protected data is mitigated by the batched,
  parameter-validated SECURITY DEFINER function whose runtime role only gets
  EXECUTE.

## 6) Rollout / Migration Plan

1. Apply `20260918120000_nd181_history_columns` (additive columns, FK, indexes)
   and `20260918121000_nd181_history_retention_prune` (prune function, grants)
   to the shared preview database; regenerate the Prisma client.
2. Ship producer recording across all nine domains together with the read
   endpoint, so the timeline is complete from first render.
3. Ship the project Timeline panel; artifact-level History tabs follow in
   ND-485.
4. Validation / fallback: events are additive; disabling producers or the panel
   degrades to the pre-existing live-refresh behavior without data loss.

## 7) Validation Requirements

- Tests: service unit coverage for summary/change bounding, cursor codec,
  history paging, actor registry fallback, and retention pruning; route tests
  for serialization, caching, cursor forwarding, and scope enforcement;
  component tests for the timeline panel (collapsed, render, paging, errors).
- RLS: the migration adds no new policies, but RLS-relevant surfaces changed,
  so the real PostgreSQL RLS matrix must pass.
- Manual verification: expand the Timeline panel on the preview deployment and
  confirm entries appear for a mutation performed from the UI.

## 8) Links

- Related tasks: ND-181 (this decision), ND-485 (artifact History tabs
  follow-up), ND-432 autosave contract (draft/save boundaries), TASK-337 actor
  identity foundation.
- Related code: `lib/services/project-activity-service.ts`,
  `app/api/projects/[projectId]/history/route.ts`,
  `components/project-timeline-panel.tsx`,
  `prisma/migrations/20260918120000_nd181_history_columns`,
  `prisma/migrations/20260918121000_nd181_history_retention_prune`.
