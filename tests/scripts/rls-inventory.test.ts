import { describe, expect, test } from "vitest";

import { validateRlsInventory } from "../../scripts/check-rls-inventory.mjs";

describe("RLS model inventory guardrail", () => {
  test("accepts the committed schema, inventory, and migrations", () => {
    expect(validateRlsInventory()).toEqual([]);
  });

  test("fails when a new Prisma model has no classification", () => {
    const errors = validateRlsInventory({
      schema: `model Existing {
  id String @id
}

model NewlyAdded {
  id String @id
}
`,
      inventory: {
        models: [
          {
            model: "Existing",
            classification: "system-operational-exempt",
            enforcement: "service",
            owner: "test owner",
            rationale: "test rationale",
          },
        ],
      },
      migrationSql: "",
    });

    expect(errors).toContain(
      "Prisma model NewlyAdded is missing from prisma/rls-inventory.json."
    );
  });

  test("requires forced policy migrations for RLS-enforced models", () => {
    const errors = validateRlsInventory({
      schema: `model Protected {
  id String @id
}
`,
      inventory: {
        models: [
          {
            model: "Protected",
            classification: "project-scoped-direct-rls",
            enforcement: "rls",
            owner: "test owner",
            rationale: "test rationale",
          },
        ],
      },
      migrationSql: `ALTER TABLE "Protected" ENABLE ROW LEVEL SECURITY;`,
    });

    expect(errors).toContain(
      "Protected is marked RLS-enforced but no FORCE RLS migration was found."
    );
  });
});
