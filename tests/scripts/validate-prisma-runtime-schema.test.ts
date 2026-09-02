import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import {
  extractPrismaModelRelations,
  findMissingPrismaRelations,
  formatMissingRelationsError,
  normalizePgConnectionString,
} from "../../scripts/validate-prisma-runtime-schema.mjs";

describe("validate-prisma-runtime-schema", () => {
  test("extracts model table names and explicit table mappings", () => {
    expect(
      extractPrismaModelRelations(`
model User {
  id String @id
}

model SystemGuard {
  id Int @id
  @@map("system_guard")
}
`)
    ).toEqual(["User", "system_guard"]);
  });

  test("the checked-in schema includes the Calendar connection relations", async () => {
    const schemaSource = await readFile("prisma/schema.prisma", "utf8");
    const relations = extractPrismaModelRelations(schemaSource);

    expect(relations).toContain("CalendarConnection");
    expect(relations).toContain("CalendarSource");
    expect(relations).toContain("CalendarPreference");
  });

  test("returns missing or non-table relations from the database query", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ relation_name: "GoogleCalendarCredential" }],
    });

    await expect(
      findMissingPrismaRelations({ query }, ["User", "GoogleCalendarCredential"])
    ).resolves.toEqual(["GoogleCalendarCredential"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("pg_class"), [
      ["User", "GoogleCalendarCredential"],
    ]);
  });

  test("explains the shared Preview expand/contract requirement", () => {
    const message = formatMissingRelationsError(["GoogleCalendarCredential"]);

    expect(message).toContain("only moves forward");
    expect(message).toContain("expand/contract");
  });

  test("uses standard libpq semantics for sslmode=require connections", () => {
    const normalized = new URL(
      normalizePgConnectionString(
        "postgresql://user:secret@example.com:5432/postgres?sslmode=require"
      )
    );

    expect(normalized.searchParams.get("sslmode")).toBe("require");
    expect(normalized.searchParams.get("uselibpqcompat")).toBe("true");
  });

  test("preserves explicit strict SSL compatibility settings", () => {
    const normalized = new URL(
      normalizePgConnectionString(
        "postgresql://user:secret@example.com/postgres?sslmode=verify-full"
      )
    );

    expect(normalized.searchParams.get("sslmode")).toBe("verify-full");
    expect(normalized.searchParams.has("uselibpqcompat")).toBe(false);
  });
});
