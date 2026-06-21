import process from "node:process";

import pg from "pg";

const { Client } = pg;

const adminDatabaseUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const runtimeDatabaseUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;

if (!adminDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error(
    "RLS_TEST_ADMIN_DATABASE_URL and RLS_TEST_RUNTIME_DATABASE_URL are required."
  );
}

const adminUrl = new URL(adminDatabaseUrl);
const runtimeUrl = new URL(runtimeDatabaseUrl);
const runtimeRole = decodeURIComponent(runtimeUrl.username);
const runtimePassword = decodeURIComponent(runtimeUrl.password);
const databaseName = decodeURIComponent(adminUrl.pathname.replace(/^\//, ""));

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(runtimeRole)) {
  throw new Error("RLS test runtime role contains unsupported characters.");
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseName)) {
  throw new Error("RLS test database name contains unsupported characters.");
}
if (!runtimePassword) {
  throw new Error("RLS test runtime URL must include a password.");
}
if (runtimeRole === decodeURIComponent(adminUrl.username) || runtimeRole === "postgres") {
  throw new Error("RLS test runtime role must differ from the migration/admin role.");
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const admin = new Client({ connectionString: adminDatabaseUrl });
await admin.connect();

try {
  const roleResult = await admin.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [runtimeRole]
  );
  if (roleResult.rowCount === 0) {
    await admin.query(`
      CREATE ROLE "${runtimeRole}"
      LOGIN
      PASSWORD ${quoteLiteral(runtimePassword)}
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
    `);
  } else {
    await admin.query(`
      ALTER ROLE "${runtimeRole}"
      WITH
      LOGIN
      PASSWORD ${quoteLiteral(runtimePassword)}
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
    `);
  }

  await admin.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO "${runtimeRole}"`);
  await admin.query(`GRANT USAGE ON SCHEMA public, app TO "${runtimeRole}"`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${runtimeRole}"`
  );
  await admin.query(
    `REVOKE ALL ON TABLE public."_prisma_migrations" FROM "${runtimeRole}"`
  );
  await admin.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${runtimeRole}"`
  );
  await admin.query(
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO "${runtimeRole}"`
  );

  const attributes = await admin.query(
    `
      SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles
      WHERE rolname = $1
    `,
    [runtimeRole]
  );
  const role = attributes.rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole
  ) {
    throw new Error("RLS test role is not least privilege.");
  }
} finally {
  await admin.end();
}

console.log(`Prepared least-privilege NOBYPASSRLS role ${runtimeRole}.`);
