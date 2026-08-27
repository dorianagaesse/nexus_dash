#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { normalizePgConnectionString } from "./validate-prisma-runtime-schema.mjs";
import { validateSupabaseProjectRef } from "./validate-supabase-project-ref.mjs";

const { Client } = pg;

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function assertPreviewResetPreflight(guard) {
  if (guard?.environment !== "staging" || guard?.allow_staging_wipe !== true) {
    throw new Error(
      "Refusing Preview schema reset: system_guard must identify an enabled staging database."
    );
  }
}

export function assertFreshResetGuard(guard) {
  if (guard?.environment !== "unknown" || guard?.allow_staging_wipe !== false) {
    throw new Error(
      "Refusing to restore the staging guard: the freshly migrated guard is not in its safe default state."
    );
  }
}

export function previewMigrationHistoryRequiresReset(
  databaseMigrations,
  checkoutMigrations
) {
  const expected = new Set(checkoutMigrations);
  return databaseMigrations.some(
    (migration) =>
      (!migration.finished_at && !migration.rolled_back_at) ||
      (migration.finished_at &&
        !migration.rolled_back_at &&
        !expected.has(migration.migration_name))
  );
}

async function readCheckoutMigrationNames(
  migrationsPath = resolve("prisma/migrations")
) {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function previewSchemaResetRequired(client, checkoutMigrations) {
  try {
    const result = await client.query(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM public._prisma_migrations
    `);
    return previewMigrationHistoryRequiresReset(
      result.rows,
      checkoutMigrations
    );
  } catch (error) {
    if (error && typeof error === "object" && error.code === "42P01") {
      return false;
    }
    throw error;
  }
}

async function readGuard(client) {
  const result = await client.query(
    "SELECT environment, allow_staging_wipe FROM public.system_guard WHERE id = 1"
  );
  return result.rows[0];
}

export async function preflightPreviewSchemaReset(client) {
  assertPreviewResetPreflight(await readGuard(client));
}

export async function restorePreviewStagingGuard(client) {
  const guard = await readGuard(client);
  if (guard?.environment === "staging" && guard?.allow_staging_wipe === true) {
    return;
  }

  assertFreshResetGuard(guard);
  const result = await client.query(`
    UPDATE public.system_guard
    SET environment = 'staging',
        allow_staging_wipe = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND environment = 'unknown'
      AND allow_staging_wipe = false
    RETURNING id
  `);
  if (result.rowCount !== 1) {
    throw new Error("Failed to restore the Preview staging guard.");
  }
}

export async function managePreviewSchemaReset({
  mode,
  connectionString,
  expectedProjectRef,
  migrationsPath,
}) {
  validateSupabaseProjectRef(connectionString, expectedProjectRef);
  const client = new Client({
    connectionString: normalizePgConnectionString(connectionString),
  });
  await client.connect();
  try {
    if (mode === "needs-reset") {
      return previewSchemaResetRequired(
        client,
        await readCheckoutMigrationNames(migrationsPath)
      );
    }
    if (mode === "preflight") {
      await preflightPreviewSchemaReset(client);
      return;
    }
    if (mode === "restore-guard") {
      await restorePreviewStagingGuard(client);
      return;
    }
    throw new Error(`Unsupported Preview schema reset mode: ${mode}`);
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const mode = process.argv[2];
    const result = await managePreviewSchemaReset({
      mode,
      connectionString: readRequiredEnv("DATABASE_URL"),
      expectedProjectRef: readRequiredEnv("EXPECTED_SUPABASE_PROJECT_REF"),
    });
    process.stdout.write(
      mode === "needs-reset"
        ? `${result ? "true" : "false"}\n`
        : `Preview schema reset ${mode} passed.\n`
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
