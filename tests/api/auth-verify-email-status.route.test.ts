import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromRequest: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  getEmailVerificationStatus: vi.fn(),
}));

const logServerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  getEmailVerificationStatus: emailVerificationMock.getEmailVerificationStatus,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: logServerErrorMock,
}));

import { GET } from "@/app/api/auth/verify-email/status/route";

describe("GET /api/auth/verify-email/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValue("user-1");
    emailVerificationMock.getEmailVerificationStatus.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        isVerified: false,
      },
    });
  });

  test("returns 401 when no session is present", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email/status")
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(emailVerificationMock.getEmailVerificationStatus).not.toHaveBeenCalled();
  });

  test("returns the verification state for the session user", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email/status")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ isVerified: false });
    expect(emailVerificationMock.getEmailVerificationStatus).toHaveBeenCalledWith(
      "user-1"
    );
  });

  test("returns the verified state once the email is verified", async () => {
    emailVerificationMock.getEmailVerificationStatus.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        email: "user@example.com",
        isVerified: true,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email/status")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isVerified: true });
  });

  test("maps service failures to their status", async () => {
    emailVerificationMock.getEmailVerificationStatus.mockResolvedValue({
      ok: false,
      status: 404,
      error: "user-not-found",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email/status")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "user-not-found" });
  });

  test("returns 500 and logs when the status lookup throws", async () => {
    const error = new Error("database unavailable");
    emailVerificationMock.getEmailVerificationStatus.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email/status")
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "verification-status-unavailable",
    });
    expect(logServerErrorMock).toHaveBeenCalledWith(
      "GET /api/auth/verify-email/status",
      error,
      { actorUserId: "user-1" }
    );
  });
});
