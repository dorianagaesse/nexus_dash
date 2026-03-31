import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  readClientIpAddress: vi.fn(),
  requireAuthenticatedApiUser: vi.fn(),
  resolveRequestId: vi.fn(),
}));

const projectAgentAccessServiceMock = vi.hoisted(() => ({
  createProjectAgentCredential: vi.fn(),
  getProjectAgentAccessSummary: vi.fn(),
  revokeProjectAgentCredential: vi.fn(),
  rotateProjectAgentCredential: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  readClientIpAddress: apiGuardMock.readClientIpAddress,
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
  resolveRequestId: apiGuardMock.resolveRequestId,
}));

vi.mock("@/lib/services/project-agent-access-service", () => ({
  createProjectAgentCredential:
    projectAgentAccessServiceMock.createProjectAgentCredential,
  getProjectAgentAccessSummary:
    projectAgentAccessServiceMock.getProjectAgentAccessSummary,
  revokeProjectAgentCredential:
    projectAgentAccessServiceMock.revokeProjectAgentCredential,
  rotateProjectAgentCredential:
    projectAgentAccessServiceMock.rotateProjectAgentCredential,
}));

import {
  GET,
  POST,
} from "@/app/api/projects/[projectId]/agent-access/route";
import { DELETE } from "@/app/api/projects/[projectId]/agent-access/[credentialId]/route";
import { POST as rotateCredential } from "@/app/api/projects/[projectId]/agent-access/[credentialId]/rotate/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("project agent access routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "owner-1",
    });
    apiGuardMock.resolveRequestId.mockReturnValue("request-123");
    apiGuardMock.readClientIpAddress.mockReturnValue("198.51.100.42");
  });

  test("GET returns the owner agent access summary", async () => {
    projectAgentAccessServiceMock.getProjectAgentAccessSummary.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
        accessTokenTtlSeconds: 600,
        credentials: [],
        recentEvents: [],
      },
    });

    const request = new Request("http://localhost/api/projects/project-1/agent-access");
    const response = await GET(request as never, {
      params: { projectId: "project-1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      projectId: "project-1",
      accessTokenTtlSeconds: 600,
      credentials: [],
      recentEvents: [],
    });
    expect(
      projectAgentAccessServiceMock.getProjectAgentAccessSummary
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
    });
  });

  test("POST validates expiry shape before calling the service", async () => {
    const request = new Request("http://localhost/api/projects/project-1/agent-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        label: "Release bot",
        scopes: ["task:read"],
        expiresInDays: "30",
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "project-1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-expiry",
    });
    expect(
      projectAgentAccessServiceMock.createProjectAgentCredential
    ).not.toHaveBeenCalled();
  });

  test("POST creates a credential and passes request audit metadata", async () => {
    projectAgentAccessServiceMock.createProjectAgentCredential.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        credential: {
          id: "credential-1",
          label: "Release bot",
          publicId: "nda_public",
          scopes: ["task:read", "task:write"],
          status: "active",
          expiresAt: null,
          lastUsedAt: null,
          lastExchangedAt: null,
          lastRotatedAt: null,
          revokedAt: null,
          createdAt: "2026-03-31T09:00:00.000Z",
          updatedAt: "2026-03-31T09:00:00.000Z",
        },
        apiKey: "nda_public.secret",
        accessTokenTtlSeconds: 600,
      },
    });

    const request = new Request("http://localhost/api/projects/project-1/agent-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Vitest",
      },
      body: JSON.stringify({
        label: "Release bot",
        scopes: ["task:read", "task:write"],
        expiresInDays: 30,
      }),
    });

    const response = await POST(request as never, {
      params: { projectId: "project-1" },
    });

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      credential: {
        id: "credential-1",
        label: "Release bot",
        publicId: "nda_public",
        scopes: ["task:read", "task:write"],
        status: "active",
        expiresAt: null,
        lastUsedAt: null,
        lastExchangedAt: null,
        lastRotatedAt: null,
        revokedAt: null,
        createdAt: "2026-03-31T09:00:00.000Z",
        updatedAt: "2026-03-31T09:00:00.000Z",
      },
      apiKey: "nda_public.secret",
      accessTokenTtlSeconds: 600,
    });
    expect(
      projectAgentAccessServiceMock.createProjectAgentCredential
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      label: "Release bot",
      scopes: ["task:read", "task:write"],
      expiresInDays: 30,
      requestId: "request-123",
      ipAddress: "198.51.100.42",
      userAgent: "Vitest",
    });
  });

  test("POST returns 400 for invalid json payloads", async () => {
    const request = new Request("http://localhost/api/projects/project-1/agent-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    const response = await POST(request as never, {
      params: { projectId: "project-1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-json",
    });
  });

  test("DELETE revokes a credential", async () => {
    projectAgentAccessServiceMock.revokeProjectAgentCredential.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        credential: {
          id: "credential-1",
        },
      },
    });

    const request = new Request(
      "http://localhost/api/projects/project-1/agent-access/credential-1",
      {
        method: "DELETE",
        headers: {
          "user-agent": "Vitest",
        },
      }
    );

    const response = await DELETE(request as never, {
      params: {
        projectId: "project-1",
        credentialId: "credential-1",
      },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      credential: {
        id: "credential-1",
      },
    });
    expect(
      projectAgentAccessServiceMock.revokeProjectAgentCredential
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      credentialId: "credential-1",
      requestId: "request-123",
      ipAddress: "198.51.100.42",
      userAgent: "Vitest",
    });
  });

  test("POST rotate issues a new raw api key", async () => {
    projectAgentAccessServiceMock.rotateProjectAgentCredential.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        credential: {
          id: "credential-1",
          label: "Release bot",
          publicId: "nda_public_next",
          scopes: ["task:read"],
          status: "active",
          expiresAt: null,
          lastUsedAt: null,
          lastExchangedAt: null,
          lastRotatedAt: "2026-03-31T10:00:00.000Z",
          revokedAt: null,
          createdAt: "2026-03-31T09:00:00.000Z",
          updatedAt: "2026-03-31T10:00:00.000Z",
        },
        apiKey: "nda_public_next.secret",
        accessTokenTtlSeconds: 600,
      },
    });

    const request = new Request(
      "http://localhost/api/projects/project-1/agent-access/credential-1/rotate",
      {
        method: "POST",
        headers: {
          "user-agent": "Vitest",
        },
      }
    );

    const response = await rotateCredential(request as never, {
      params: {
        projectId: "project-1",
        credentialId: "credential-1",
      },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      credential: {
        id: "credential-1",
        label: "Release bot",
        publicId: "nda_public_next",
        scopes: ["task:read"],
        status: "active",
        expiresAt: null,
        lastUsedAt: null,
        lastExchangedAt: null,
        lastRotatedAt: "2026-03-31T10:00:00.000Z",
        revokedAt: null,
        createdAt: "2026-03-31T09:00:00.000Z",
        updatedAt: "2026-03-31T10:00:00.000Z",
      },
      apiKey: "nda_public_next.secret",
      accessTokenTtlSeconds: 600,
    });
    expect(
      projectAgentAccessServiceMock.rotateProjectAgentCredential
    ).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "project-1",
      credentialId: "credential-1",
      requestId: "request-123",
      ipAddress: "198.51.100.42",
      userAgent: "Vitest",
    });
  });
});
