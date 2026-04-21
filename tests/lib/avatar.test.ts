import { describe, expect, test } from "vitest";

import {
  buildGeneratedAvatarDataUri,
  resolveAvatarSeed,
} from "@/lib/avatar";

describe("avatar helpers", () => {
  test("builds deterministic avatar data URIs from the same seed", () => {
    const first = buildGeneratedAvatarDataUri("seed-123");
    const second = buildGeneratedAvatarDataUri("seed-123");

    expect(first).toBe(second);
    expect(first).toContain("data:image/svg+xml");
  });

  test("builds different avatar data URIs for different seeds", () => {
    const first = buildGeneratedAvatarDataUri("seed-123");
    const second = buildGeneratedAvatarDataUri("seed-456");

    expect(first).not.toBe(second);
  });

  test("does not embed the raw seed in the generated svg metadata", () => {
    const encodedUri = buildGeneratedAvatarDataUri("seed-123");
    const svg = decodeURIComponent(
      encodedUri.replace("data:image/svg+xml;charset=UTF-8,", "")
    );

    expect(svg).toContain("Generated avatar");
    expect(svg).not.toContain("seed-123");
  });

  test("resolves avatar seed from stored seed or stable fallback key", () => {
    expect(resolveAvatarSeed(" custom-seed ", "user-1")).toBe("custom-seed");
    expect(resolveAvatarSeed(null, "user-1")).toBe("user-1");
  });
});
