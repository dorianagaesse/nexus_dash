import { describe, expect, test, vi } from "vitest";

import {
  assertFreshResetGuard,
  assertPreviewResetPreflight,
  previewMigrationHistoryRequiresReset,
  previewSchemaResetRequired,
  restorePreviewStagingGuard,
} from "../../scripts/manage-preview-schema-reset.mjs";

describe("manage-preview-schema-reset", () => {
  test("allows reset only for the explicitly enabled staging database", () => {
    expect(() =>
      assertPreviewResetPreflight({
        environment: "staging",
        allow_staging_wipe: true,
      })
    ).not.toThrow();

    expect(() =>
      assertPreviewResetPreflight({
        environment: "production",
        allow_staging_wipe: false,
      })
    ).toThrow("Refusing Preview schema reset");
  });

  test("restores only a freshly migrated safe-default guard", () => {
    expect(() =>
      assertFreshResetGuard({
        environment: "unknown",
        allow_staging_wipe: false,
      })
    ).not.toThrow();

    expect(() =>
      assertFreshResetGuard({
        environment: "production",
        allow_staging_wipe: false,
      })
    ).toThrow("Refusing to restore the staging guard");
  });

  test("marks the reset database as staging after checking its safe default", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ environment: "unknown", allow_staging_wipe: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    await restorePreviewStagingGuard({ query });

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE public.system_guard")
    );
  });

  test("treats an already restored staging guard as idempotent", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ environment: "staging", allow_staging_wipe: true }],
    });

    await restorePreviewStagingGuard({ query });

    expect(query).toHaveBeenCalledTimes(1);
  });

  test("keeps compatible migration history without a reset", () => {
    expect(
      previewMigrationHistoryRequiresReset(
        [
          {
            migration_name: "20260101000000_base",
            finished_at: new Date(),
            rolled_back_at: null,
          },
        ],
        ["20260101000000_base", "20260102000000_feature"]
      )
    ).toBe(false);
  });

  test("requires reset for migrations from another branch or failed attempts", () => {
    expect(
      previewMigrationHistoryRequiresReset(
        [
          {
            migration_name: "20260103000000_other_branch",
            finished_at: new Date(),
            rolled_back_at: null,
          },
        ],
        ["20260101000000_base"]
      )
    ).toBe(true);
    expect(
      previewMigrationHistoryRequiresReset(
        [
          {
            migration_name: "20260102000000_failed",
            finished_at: null,
            rolled_back_at: null,
          },
        ],
        ["20260101000000_base", "20260102000000_failed"]
      )
    ).toBe(true);
  });

  test("treats a database without migration history as forward deployable", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ relation: null }] });

    await expect(
      previewSchemaResetRequired({ query }, ["20260101000000_base"])
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
