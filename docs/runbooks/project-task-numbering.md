# Project-local task references (ND-536)

`ND-1`, `ND-2`, etc. identify tasks **within a project**. Store and exchange
the immutable CUID `Task.id` and project ID for integrations and links. Numbers
are assigned in PostgreSQL by an insert trigger and a project counter row, in
the same transaction as the task. Concurrent inserts serialize per project;
failed/rolled-back inserts do not consume a number. Deletion never resets the
counter. New projects start at 1, including projects with no tasks at migration.
Do not supply reference numbers on insert or move tasks between projects.

Normal creation uses INSERT, not `ON CONFLICT DO NOTHING`: PostgreSQL runs
BEFORE INSERT triggers even for a conflict that is subsequently ignored, so
using skip-duplicates imports would consume numbers. Imports must use normal
transactional creates and roll back failed inserts. Multi-project bulk writers
should acquire project counters in a consistent project-ID order to avoid
deadlocks; the current task API operates on one project per request.

## Compatibility and resolution

The migration snapshots each old global number in nullable, globally unique
`Task.legacyReferenceNumber`, then numbers all existing tasks per project by
`createdAt ASC, id ASC`, including Done and archived tasks. It changes no IDs,
foreign keys, task content/timestamps, comments, or attachment ownership. Numbers
for new tasks have no legacy alias. Task identity, project and both reference
fields are immutable after migration.

Authenticated lookup (session or agent with `task:read`):

```text
GET /api/projects/{projectId}/tasks/reference?reference=ND-42
GET /api/projects/{projectId}/tasks/reference?reference=ND-536&namespace=legacy
```

Returns `{ id, projectId, reference, legacyReference, url }`, including archived
tasks. Unknown/deleted numbers return 404. Access is checked in the service and
through tenant RLS. `namespace` is `current` by default; no automatic fallback
exists because an old global number can identify a different current task.
Follow the returned internal-ID URL. Hosted agent docs/OpenAPI include this
endpoint. Legacy lookup is retained indefinitely unless a separate retirement
decision is made; deleting a task also deletes its alias.

| Surface | Compatibility plan |
| --- | --- |
| Board, epic rollups, related-task picker, filters, task search | Already scoped to project ID; render the migrated number. Text search remains substring search, not identity resolution. |
| Descriptions, comments, meeting notes, context cards | Preserve authored prose. Old bare ND references require explicit legacy lookup with project context; do not rewrite arbitrary text or silently link it to a current number. |
| Notification metadata and email destinations | Existing producers store task CUIDs and project IDs; `/projects/{projectId}?taskId={id}` destinations remain valid. Preserve historical message text. |
| Live activity replay and already-open tabs | Invalidate cached task snapshots in activity payloads while retaining event identity/metadata. Advance affected project versions so connected clients refresh instead of retaining old numbers. Reload open tabs at cutover to discard any client-local snapshots. |
| Existing exports, copied references, PR titles, branches, journals and external links | Immutable historical snapshots are not rewritten. Retain migration mapping CSV and resolve pre-cutover ND numbers in the legacy namespace. Future exports/integrations must carry project ID and task ID alongside display references. |
| Internal-ID deep links and API paths | Unchanged. Number-only links were not a supported route; no ambiguous number-only redirect is introduced. |

## Production rollout and evidence

This is a data migration, not an online rolling schema change. Before rollout,
announce the numbering cutover and legacy lookup instructions. Arrange a write
maintenance window covering browser/API writers, jobs and old deployments.
Drain in-flight writes. Take a verified database backup/PITR restore point and
test its restore in a disposable database. Deploy the application and migration
together; do not permit an old instance to write during cutover. Large projects
need a rehearsal to measure lock time and index storage.

Run the following with the admin connection and save output in the restricted
deployment evidence, not the repository. Export the pre-migration map with
`psql` (the file may contain private project identifiers):

```sql
\copy (SELECT id, "projectId", "referenceNumber", "createdAt", "archivedAt" FROM "Task" ORDER BY "projectId", "createdAt", id) TO 'task-references-before.csv' CSV HEADER
SELECT "projectId", count(*) AS tasks, count("archivedAt") AS archived
FROM "Task" GROUP BY "projectId" ORDER BY "projectId";
SELECT 'TaskRelation' AS source, count(*) FROM "TaskRelation"
UNION ALL SELECT 'TaskComment', count(*) FROM "TaskComment"
UNION ALL SELECT 'TaskAttachment', count(*) FROM "TaskAttachment";
```

Run `prisma migrate deploy` from the release ref. Migration
`20261108120000_nd536_project_task_references` locks Project and Task, performs
transactional DDL/backfill, checks snapshot identity/order/counts and allocator
initialization, and installs both uniqueness indexes before commit. A failure
rolls everything back. Prisma's migration ledger applies it once; never rerun
the backfill manually against an active system.

Immediately after migration, while writes remain paused, repeat the count
queries above and save these checks and the after-map:

```sql
\copy (SELECT id, "projectId", "legacyReferenceNumber", "referenceNumber" FROM "Task" ORDER BY "projectId", "referenceNumber") TO 'task-references-after.csv' CSV HEADER
-- Both return zero rows.
SELECT "projectId", "referenceNumber", count(*) FROM "Task"
GROUP BY "projectId", "referenceNumber" HAVING count(*) > 1;
SELECT "legacyReferenceNumber", count(*) FROM "Task"
WHERE "legacyReferenceNumber" IS NOT NULL
GROUP BY "legacyReferenceNumber" HAVING count(*) > 1;
-- Zero rows: every task mapped, deterministic contiguous snapshot numbering.
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id) AS expected FROM "Task"
)
SELECT id FROM ranked WHERE "referenceNumber" <> expected OR "legacyReferenceNumber" IS NULL;
-- Zero rows, including empty projects.
SELECT p.id FROM "Project" p LEFT JOIN "TaskReferenceCounter" c ON c."projectId"=p.id
WHERE c."nextNumber" IS NULL OR c."nextNumber" <> (SELECT count(*)+1 FROM "Task" t WHERE t."projectId"=p.id);
```

Compare CSVs by internal ID: all original IDs/project IDs must survive and each
old number must equal the corresponding legacy number. Compare relation,
comment and attachment counts. Record the release SHA, migration duration,
before/after counts, zero-row uniqueness/order/counter results, and backup
restore point in deployment evidence. Smoke-test both namespaces, old deep
links, related-task search, and new UI/API creates in two test projects before
resuming writers. Counts/order checks describe the migration snapshot only;
normal later deletion creates intentional gaps.

## Recovery

If migration fails, keep writers paused and inspect the failure; its explicit
transaction restores the pre-migration schema/data. Confirm rollback before
using Prisma's failed-migration recovery procedure and retrying the same ref.
If verification fails after commit, keep writers paused and restore the tested
pre-cutover backup/PITR point together with the matching application revision.
Do not simply roll back app code or rerun renumbering. If writes already resumed,
capture the post-cutover database first and reconcile those writes in a restored
copy before switching traffic; blind restore would lose new work. There is no
automatic destructive down migration.

## Reproducible verification

`npm run test:rls` runs `scripts/test-task-reference-migration.mjs` against an
isolated schema using the committed SQL, then the full real PostgreSQL tenant
matrix. Fixtures cover ties, multiple/empty projects, archived tasks, stable
relations/comments, new projects, concurrent creates, rollback, failed inserts,
deletion, immutable identity and denied viewer/cross-project allocation. The
schema is cleaned up afterward. Unit/API tests cover namespace separation,
validation, scope/membership checks and error mapping. The task-reference
Playwright test covers UI/API creation, duplicate numbers across projects,
search, related-task selection and stable CUID deep links.
