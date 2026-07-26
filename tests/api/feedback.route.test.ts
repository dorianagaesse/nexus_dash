import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const productFeedbackServiceMock = vi.hoisted(() => ({
  submitProductFeedback: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/product-feedback-service", () => ({
  submitProductFeedback: productFeedbackServiceMock.submitProductFeedback,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

import { POST } from "@/app/api/feedback/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("product feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("rejects unauthenticated submissions", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/feedback", { method: "POST" })
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(productFeedbackServiceMock.submitProductFeedback).not.toHaveBeenCalled();
  });

  test("rejects malformed json without invoking the service", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
    expect(productFeedbackServiceMock.submitProductFeedback).not.toHaveBeenCalled();
  });

  test("forwards authenticated report data and returns delivery state", async () => {
    productFeedbackServiceMock.submitProductFeedback.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: { delivery: "sent" },
    });
    const payload = {
      reportType: "feedback",
      message: "A compact roadmap view would help.",
      pagePath: "/projects/project-1",
      diagnostics: null,
    };

    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({ delivery: "sent" });
    expect(productFeedbackServiceMock.submitProductFeedback).toHaveBeenCalledWith({
      actorUserId: "user-1",
      ...payload,
    });
  });

  test("maps service throttling to a recoverable API response", async () => {
    productFeedbackServiceMock.submitProductFeedback.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: "rate-limited",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportType: "bug",
          message: "The board stopped updating.",
        }),
      })
    );

    expect(response.status).toBe(429);
    await expect(readJson(response)).resolves.toEqual({ error: "rate-limited" });
  });
});
