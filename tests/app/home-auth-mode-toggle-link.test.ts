import { describe, expect, test } from "vitest";

import { buildHomeAuthHref } from "@/app/home-auth-mode-toggle-link";

describe("buildHomeAuthHref", () => {
  test("builds form-only href when no email exists", () => {
    expect(buildHomeAuthHref("signin")).toBe("/?form=signin");
    expect(buildHomeAuthHref("signup", "")).toBe("/?form=signup");
  });

  test("preserves normalized email in query string", () => {
    expect(buildHomeAuthHref("signup", "  person@example.com  ")).toBe(
      "/?form=signup&email=person%40example.com"
    );
  });

  test("drops oversized email values", () => {
    const oversized = `${"a".repeat(321)}@example.com`;
    expect(buildHomeAuthHref("signin", oversized)).toBe("/?form=signin");
  });
});
