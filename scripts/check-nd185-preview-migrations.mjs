#!/usr/bin/env node

import pg from "pg";

import { normalizePgConnectionString } from "./validate-prisma-runtime-schema.mjs";

const { Client } = pg;
const state = process.argv[2];
if (state !== "failed" && state !== "rolled-back") {
  throw new Error("Expected migration state: failed or rolled-back.");
}

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const client = new Client({
  connectionString: normalizePgConnectionString(connectionString),
});

try {
  await client.connect();

  const { rows } = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20261004120000_nd185_epic_leadership',
      '20261004120000_nd185_epic_attribution'
    )
    ORDER BY started_at
  `);
  const leadership = rows.filter(
    (row) => row.migration_name === "20261004120000_nd185_epic_leadership"
  );
  const attribution = rows.filter(
    (row) => row.migration_name === "20261004120000_nd185_epic_attribution"
  );

  if (
    leadership.length !== 1 ||
    !leadership[0].finished_at ||
    leadership[0].rolled_back_at ||
    attribution.length !== 1 ||
    attribution[0].finished_at ||
    Boolean(attribution[0].rolled_back_at) !== (state === "rolled-back")
  ) {
    throw new Error(`ND-185 migration records do not match expected ${state} state.`);
  }

  const { rows: columns } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Epic'
      AND column_name IN ('createdByUserId', 'leadKind')
  `);
  if (!columns.some((row) => row.column_name === "createdByUserId") ||
      !columns.some((row) => row.column_name === "leadKind")) {
    throw new Error("Preview Epic schema does not match the applied leadership migration.");
  }

  process.stdout.write(`ND-185 Preview migration state verified: ${state}.\n`);
} finally {
  await client.end();
}
