#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

const { Client } = pg;

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function extractPrismaModelRelations(schemaSource) {
  const relations = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  for (const match of schemaSource.matchAll(modelPattern)) {
    const modelName = match[1];
    const modelBody = match[2] ?? "";
    const mappedName = /@@map\("([^"]+)"\)/.exec(modelBody)?.[1];
    relations.push(mappedName ?? modelName);
  }

  return relations;
}

export function formatMissingRelationsError(missingRelations) {
  return [
    "Runtime schema is incompatible with the checked-out Prisma models.",
    `Missing table(s): ${missingRelations.join(", ")}.`,
    "The shared database may have been advanced by another preview branch; use an isolated or reset preview database before deployment.",
  ].join(" ");
}

export async function findMissingPrismaRelations(client, expectedRelations) {
  const result = await client.query(
    `
      SELECT expected.relation_name
      FROM unnest($1::text[]) AS expected(relation_name)
      LEFT JOIN pg_class relation
        ON relation.oid = to_regclass(
          format('%I.%I', 'public', expected.relation_name)
        )
      WHERE relation.oid IS NULL OR relation.relkind NOT IN ('r', 'p')
      ORDER BY expected.relation_name
    `,
    [expectedRelations]
  );

  return result.rows.map((row) => row.relation_name);
}

export async function validatePrismaRuntimeSchema({
  connectionString,
  schemaPath = resolve("prisma/schema.prisma"),
}) {
  const schemaSource = await readFile(schemaPath, "utf8");
  const expectedRelations = extractPrismaModelRelations(schemaSource);
  if (expectedRelations.length === 0) {
    throw new Error("No Prisma models were found in prisma/schema.prisma.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const missingRelations = await findMissingPrismaRelations(
      client,
      expectedRelations
    );
    if (missingRelations.length > 0) {
      throw new Error(formatMissingRelationsError(missingRelations));
    }
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await validatePrismaRuntimeSchema({
      connectionString: readRequiredEnv("DATABASE_URL"),
    });
    process.stdout.write("Prisma runtime schema compatibility passed.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
