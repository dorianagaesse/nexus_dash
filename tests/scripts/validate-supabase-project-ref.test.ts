import { describe, expect, test } from "vitest";

import {
  extractSupabaseProjectRef,
  validateSupabaseProjectRef,
} from "../../scripts/validate-supabase-project-ref.mjs";

describe("validate-supabase-project-ref", () => {
  test("extracts project refs from transaction and session pooler usernames", () => {
    expect(
      extractSupabaseProjectRef(
        "postgresql://app_runtime.preview-ref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
      )
    ).toBe("preview-ref");
    expect(
      extractSupabaseProjectRef(
        "postgresql://postgres.preview-ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
      )
    ).toBe("preview-ref");
  });

  test("extracts project refs from direct Supabase hosts", () => {
    expect(
      extractSupabaseProjectRef(
        "postgresql://postgres:secret@db.preview-ref.supabase.co:5432/postgres"
      )
    ).toBe("preview-ref");
  });

  test("accepts the expected project and rejects cross-environment targets", () => {
    const connection =
      "postgresql://postgres.preview-ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";

    expect(() => validateSupabaseProjectRef(connection, "preview-ref")).not.toThrow();
    expect(() => validateSupabaseProjectRef(connection, "production-ref")).toThrow(
      "Database connection does not match EXPECTED_SUPABASE_PROJECT_REF."
    );
  });
});
