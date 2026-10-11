import { describe, expect, test } from "vitest";
import {
  LIVE_SAVE_ENABLED_SURFACES,
  LIVE_SAVE_SURFACES,
  isLiveSaveSurfaceEnabled,
} from "@/lib/live-save/rollout";

describe("live-save rollout gate", () => {
  test("keeps every known surface disabled until the release gates are met", () => {
    for (const surface of LIVE_SAVE_SURFACES) {
      expect(isLiveSaveSurfaceEnabled(surface)).toBe(false);
    }
    expect(LIVE_SAVE_ENABLED_SURFACES.size).toBe(0);
  });

  test("covers the surfaces named in the autosave contract", () => {
    expect(LIVE_SAVE_SURFACES).toEqual([
      "task-detail",
      "meeting-preparation",
      "meeting-output",
    ]);
  });
});
