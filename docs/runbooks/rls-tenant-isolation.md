# RLS Inventory and Tenant-Isolation Validation

This runbook owns the repository contract for classifying Prisma models,
extending PostgreSQL row-level security, and reproducing the least-privilege
tenant-isolation test matrix.

## Sources of Truth

- `prisma/schema.prisma`: database model definitions.
- `prisma/rls-inventory.json`: classification and enforcement decision for
  every Prisma model.
- `prisma/migrations/**/migration.sql`: committed RLS policies.
- `scripts/check-rls-inventory.mjs`: schema/inventory/policy guardrail.
- `scripts/test-rls-isolation.mjs`: real PostgreSQL isolation scenarios.

Every inventory entry declares:

- one of the supported classifications;
- whether enforcement is `rls`, `service`, or `operational`;
- the service or operational owner;
- the reason for the decision.

Authentication/session tables remain service-enforced because they must be
queried before an actor is authenticated. Project notification email queue
tables remain operationally enforced because the protected scheduler claims
and reconciles work across recipients. These exemptions are intentional and
must not be copied to ordinary project content.

## Adding a Prisma Model

When `prisma/schema.prisma` gains a model:

1. Add exactly one matching entry to `prisma/rls-inventory.json`.
2. If it carries `projectId` or derives from project-owned data, prefer forced
   RLS unless a pre-authentication or cross-tenant operational workflow makes
   database policy enforcement unsuitable.
3. For an exemption, name the enforcement owner and explain why a normal actor
   transaction cannot be used.
4. For RLS enforcement, add both `ENABLE ROW LEVEL SECURITY` and
   `FORCE ROW LEVEL SECURITY`, plus explicit command policies.
5. Extend the real-database matrix when the new model adds a materially new
   ownership path or role rule.
6. Run `npm run rls:check`.

CI fails when a Prisma model is absent from the inventory or an RLS-enforced
model has no committed enable/force migration.

## Policy Conventions

- Actor identity is transaction-local:

  ```sql
  SELECT set_config('app.user_id', '<user-id>', true);
  ```

- Application code uses `withActorRlsContext` so context and queries share one
  transaction/client.
- `owner` has full project-content access.
- `editor` may read/create/update content but cannot perform owner-only deletes
  or project/credential administration.
- `viewer` is read-only.
- Child-table policies derive tenant ownership through their parent relation.
- Pre-authentication database functions must be narrowly scoped,
  `SECURITY DEFINER`, use a fixed safe `search_path`, and expose only the fields
  required for that operation.

## Local Reproduction

Start a disposable PostgreSQL 16 database and apply migrations with the admin
connection:

```pwsh
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public"
$env:DIRECT_URL = $env:DATABASE_URL
npm run db:local:up
npm run db:migrate
```

Configure separate admin and runtime URLs, then provision and test the runtime
role:

```pwsh
$env:RLS_TEST_ADMIN_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/nexusdash"
$env:RLS_TEST_RUNTIME_DATABASE_URL = "postgresql://nexusdash_rls_test:nexusdash_rls_test@127.0.0.1:5432/nexusdash"
npm run test:rls:setup
npm run test:rls
```

The setup script creates or repairs a login role that is non-superuser,
`NOBYPASSRLS`, cannot create databases or roles, and cannot mutate Prisma's
migration history. Migrations continue to use the privileged admin connection;
the isolation matrix uses only the runtime URL.

The matrix covers:

- absent and unknown actor context;
- cross-project SELECT/INSERT/UPDATE/DELETE;
- owner/editor/viewer differences;
- revoked membership;
- child rows reached through foreign IDs;
- agent credential, scope-grant, and audit visibility;
- the exact-public-ID agent exchange function.

## Troubleshooting

- `42501` on an allowed operation: inspect the command policy and confirm the
  actor context was set in the same transaction.
- Rows unexpectedly invisible: verify membership, role, parent foreign keys,
  and `app.current_user_id()`.
- Test unexpectedly succeeds: confirm the runtime role has `rolsuper = false`
  and `rolbypassrls = false`; do not run the matrix as `postgres`.
- Migration succeeds but runtime gets table permission errors: rerun the local
  role setup after migrations and review production grants for the new table.
- Security-definer lookup fails: verify the function owner can read the target
  table, its `search_path` is fixed, and execute permission is granted only to
  the intended runtime role/public contract.
