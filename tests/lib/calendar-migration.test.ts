import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

describe("TASK-327 Calendar migration", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260806112500_task327_calendar_connections/migration.sql"
    ),
    "utf8"
  );

  test("preserves legacy tokens and creates selected sources/preferences", () => {
    expect(migration).toContain(
      'ALTER TABLE "GoogleCalendarCredential" RENAME TO "CalendarConnection"'
    );
    expect(migration).toContain("'legacy:' || \"id\"");
    expect(migration).toContain('INSERT INTO "CalendarSource"');
    expect(migration).toContain('INSERT INTO "CalendarPreference"');
    expect(migration).toContain('true, true, "createdAt", "updatedAt"');
  });

  test("enforces composite ownership and direct RLS for every new table", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("connectionId", "userId") REFERENCES "CalendarConnection"("id", "userId")'
    );
    for (const table of [
      "CalendarConnection",
      "CalendarSource",
      "CalendarPreference",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
  });
});
