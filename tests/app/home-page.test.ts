import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import Home from "@/app/page";

(globalThis as { React?: typeof React }).React = React;

function serializeReactTree(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "function") {
      return `[Function ${currentValue.name || "anonymous"}]`;
    }

    if (typeof currentValue === "object" && currentValue !== null) {
      if (seen.has(currentValue)) {
        return "[Circular]";
      }

      seen.add(currentValue);
    }

    return currentValue;
  });
}

describe("home page auth entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects signed-in users to projects", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(Home({})).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/projects");
  });

  test("renders sign-in form by default for signed-out users", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);

    const element = await Home({});
    const serialized = serializeReactTree(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(serialized).toContain("Welcome back");
    expect(serialized).toContain("signin-email");
    expect(serialized).toContain("signin-password");
    expect(serialized).not.toContain("signup-email");
    expect(serialized).not.toContain("signup-password");
  });

  test("renders sign-up form when query param requests it", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);

    const element = await Home({
      searchParams: {
        form: "signup",
      },
    });
    const serialized = serializeReactTree(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(serialized).toContain("Create your account");
    expect(serialized).toContain("Sign in");
    expect(serialized).toContain("Sign up");
    expect(serialized).toContain("signup-email");
    expect(serialized).toContain("signup-password");
    expect(serialized).not.toContain("signin-email");
    expect(serialized).not.toContain("signin-password");
  });
});
