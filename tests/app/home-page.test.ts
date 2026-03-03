import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromServer: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  isEmailVerifiedForUser: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  isLiveProductionDeployment: vi.fn(),
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromServer: sessionUserMock.getSessionUserIdFromServer,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  isEmailVerifiedForUser: emailVerificationMock.isEmailVerifiedForUser,
}));

vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server"
  );

  return {
    ...actual,
    isLiveProductionDeployment: envMock.isLiveProductionDeployment,
  };
});

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
    envMock.isLiveProductionDeployment.mockReturnValue(true);
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValue(true);
  });

  test("redirects signed-in users to projects", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(true);
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(Home({})).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/projects");
  });

  test("redirects signed-in unverified users to verify-email", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(false);
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(Home({})).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/verify-email");
  });

  test("redirects signed-in users to projects outside live production", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce("user-1");
    envMock.isLiveProductionDeployment.mockReturnValueOnce(false);
    emailVerificationMock.isEmailVerifiedForUser.mockResolvedValueOnce(false);
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

  test("prefills sign-in email from query string", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);

    const element = await Home({
      searchParams: {
        form: "signin",
        email: "person@example.com",
      },
    });
    const serialized = serializeReactTree(element);

    expect(serialized).toContain("signin-email");
    expect(serialized).toContain("person@example.com");
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
    expect(serialized).toContain("signup-username");
    expect(serialized).toContain("signup-password");
    expect(serialized).toContain("signup-confirm-password");
    expect(serialized).toContain('"autoCapitalize":"none"');
    expect(serialized).toContain('"autoCorrect":"off"');
    expect(serialized).toContain('"pattern":"[A-Za-z0-9._]+"');
    expect(serialized).not.toContain("signin-email");
    expect(serialized).not.toContain("signin-password");
  });

  test("prefills sign-up email from query string", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);

    const element = await Home({
      searchParams: {
        form: "signup",
        email: "person@example.com",
      },
    });
    const serialized = serializeReactTree(element);

    expect(serialized).toContain("signup-email");
    expect(serialized).toContain("person@example.com");
  });
});
