#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function extractSupabaseProjectRef(connectionString) {
  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error("Database connection must be a valid absolute URL.");
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (host.endsWith(".pooler.supabase.com")) {
    const username = decodeURIComponent(parsedUrl.username);
    const separatorIndex = username.lastIndexOf(".");
    return separatorIndex > 0 ? username.slice(separatorIndex + 1).toLowerCase() : null;
  }

  const directMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(host);
  return directMatch?.[1]?.toLowerCase() ?? null;
}

export function validateSupabaseProjectRef(connectionString, expectedProjectRef) {
  const normalizedExpectedRef = expectedProjectRef.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalizedExpectedRef)) {
    throw new Error(
      "EXPECTED_SUPABASE_PROJECT_REF must contain only lowercase letters, numbers, and hyphens."
    );
  }

  const actualProjectRef = extractSupabaseProjectRef(connectionString);
  if (!actualProjectRef || actualProjectRef !== normalizedExpectedRef) {
    throw new Error(
      "Database connection does not match EXPECTED_SUPABASE_PROJECT_REF."
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    validateSupabaseProjectRef(
      readRequiredEnv("DATABASE_URL"),
      readRequiredEnv("EXPECTED_SUPABASE_PROJECT_REF")
    );
    process.stdout.write("Supabase project-ref validation passed.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
