import { describe, expect, test, vi } from "vitest";

import {
  assertFreshResetGuard,
  assertPreviewResetPreflight,
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
});
