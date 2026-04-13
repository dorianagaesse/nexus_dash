import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAgentAccessServiceMock = vi.hoisted(() => ({
  exchangeAgentApiKeyForAccessToken: vi.fn(),
}));

vi.mock("@/lib/services/project-agent-access-service", () => ({
  exchangeAgentApiKeyForAccessToken:
    projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken,
}));

import { POST } from "@/app/api/auth/agent/token/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/auth/agent/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("exchanges an api key from the Authorization header", async () => {
    projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        accessToken: "bearer-token",
        tokenType: "Bearer",
        expiresAt: "2026-03-31T10:00:00.000Z",
        expiresInSeconds: 600,
        projectId: "project-1",
        scopes: ["task:read"],
      },
    });

    const request = new Request("http://localhost/api/auth/agent/token", {
      method: "POST",
      headers: {
        authorization: "ApiKey nda_public.secret",
        "x-forwarded-for": "198.51.100.20, 10.0.0.1",
        "x-request-id": "request-123",
        "user-agent": "Vitest",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      accessToken: "bearer-token",
      tokenType: "Bearer",
      expiresAt: "2026-03-31T10:00:00.000Z",
      expiresInSeconds: 600,
      projectId: "project-1",
      scopes: ["task:read"],
    });
    expect(
      projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken
    ).toHaveBeenCalledWith({
      apiKey: "nda_public.secret",
      requestId: "request-123",
      ipAddress: "198.51.100.20",
      userAgent: "Vitest",
    });
  });

  test("accepts an api key from the json body", async () => {
    projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "invalid-api-key",
    });

    const request = new Request("http://localhost/api/auth/agent/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-456",
      },
      body: JSON.stringify({
        apiKey: "nda_public.secret",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-api-key",
    });
    expect(
      projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken
    ).toHaveBeenCalledWith({
      apiKey: "nda_public.secret",
      requestId: "request-456",
      ipAddress: null,
      userAgent: null,
    });
  });

  test("returns 429 when abuse controls throttle token exchange", async () => {
    projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: "too-many-attempts",
    });

    const request = new Request("http://localhost/api/auth/agent/token", {
      method: "POST",
      headers: {
        authorization: "ApiKey nda_public.secret",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(429);
    await expect(readJson(response)).resolves.toEqual({
      error: "too-many-attempts",
    });
  });

  test("returns 400 for invalid json payloads", async () => {
    const request = new Request("http://localhost/api/auth/agent/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-json",
    });
    expect(
      projectAgentAccessServiceMock.exchangeAgentApiKeyForAccessToken
    ).not.toHaveBeenCalled();
  });
});
