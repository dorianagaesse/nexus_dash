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

  test("renders sign-in and sign-up entry for signed-out users", async () => {
    sessionUserMock.getSessionUserIdFromServer.mockResolvedValueOnce(null);

    const element = await Home({});
    const serialized = JSON.stringify(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(serialized).toContain("Sign in");
    expect(serialized).toContain("Sign up");
  });
});
