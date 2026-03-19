import { beforeEach, describe, expect, test, vi } from "vitest";

import { normalizeReturnToPath } from "@/lib/social-auth";

describe("social-auth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  test("keeps safe in-app return paths", () => {
    expect(normalizeReturnToPath("/projects?tab=active#auth")).toBe(
      "/projects?tab=active#auth"
    );
  });

  test("falls back for protocol-relative and malformed paths", () => {
    expect(normalizeReturnToPath("//evil.com")).toBe("/projects");
    expect(normalizeReturnToPath("/\\evil")).toBe("/projects");
    expect(normalizeReturnToPath("/projects\u0000")).toBe("/projects");
  });
});
