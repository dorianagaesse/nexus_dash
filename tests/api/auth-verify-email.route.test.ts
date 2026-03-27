import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionUserMock = vi.hoisted(() => ({
  getSessionUserIdFromRequest: vi.fn(),
}));

const emailVerificationMock = vi.hoisted(() => ({
  consumeEmailVerificationToken: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserIdFromRequest: sessionUserMock.getSessionUserIdFromRequest,
}));

vi.mock("@/lib/services/email-verification-service", () => ({
  consumeEmailVerificationToken: emailVerificationMock.consumeEmailVerificationToken,
}));

import { GET } from "@/app/api/auth/verify-email/route";

describe("GET /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValue(null);
  });

  test("redirects with invalid-link when token query is missing", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/verify-email?error=invalid-verification-link"
    );
  });

  test("redirects with expired-link when token is expired", async () => {
    emailVerificationMock.consumeEmailVerificationToken.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "token-expired",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email?token=abc")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/verify-email?error=expired-verification-link"
    );
  });

  test("redirects authenticated matching actor to projects after success", async () => {
    sessionUserMock.getSessionUserIdFromRequest.mockResolvedValueOnce("user-1");
    emailVerificationMock.consumeEmailVerificationToken.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        userId: "user-1",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email?token=abc")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/projects?status=email-verified"
    );
  });

  test("redirects signed-out users to sign-in after success", async () => {
    emailVerificationMock.consumeEmailVerificationToken.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        userId: "user-1",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/auth/verify-email?token=abc")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?form=signin&status=email-verified&returnTo=%2Fprojects"
    );
  });
});
