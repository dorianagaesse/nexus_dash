import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/hooks/use-dismissible-menu", () => ({
  useDismissibleMenu: vi.fn(() => ({ current: null })),
}));

import { AccountMenu } from "@/components/account-menu";

(globalThis as { React?: typeof React }).React = React;

describe("account-menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when user is not authenticated", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountMenu, {
        isAuthenticated: false,
        displayName: null,
        usernameTag: null,
      })
    );

    expect(result).toBe("");
  });

  test("renders account menu trigger when user is authenticated", () => {
    const result = renderToStaticMarkup(
      React.createElement(AccountMenu, {
        isAuthenticated: true,
        displayName: "test.user",
        usernameTag: "test.user#abc123",
      })
    );

    expect(result).toContain("aria-label=\"Account menu\"");
    expect(result).toContain("aria-expanded=\"false\"");
  });
});
