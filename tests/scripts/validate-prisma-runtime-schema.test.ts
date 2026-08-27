import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import {
  extractPrismaModelRelations,
  findMissingPrismaRelations,
  formatMissingRelationsError,
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

  test("the checked-in schema includes the Calendar credential relation", async () => {
    const schemaSource = await readFile("prisma/schema.prisma", "utf8");

    expect(extractPrismaModelRelations(schemaSource)).toContain(
      "GoogleCalendarCredential"
    );
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

  test("explains shared Preview schema contamination", () => {
    expect(formatMissingRelationsError(["GoogleCalendarCredential"])).toContain(
      "advanced by another preview branch"
    );
  });
});
