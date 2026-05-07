import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  createProject: vi.fn(),
  listProjectsWithCounts: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/project-service", () => ({
  createProject: projectServiceMock.createProject,
  listProjectsWithCounts: projectServiceMock.listProjectsWithCounts,
}));

import { GET, POST } from "@/app/api/projects/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("projects collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("GET returns auth failure response when unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/projects"));

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(projectServiceMock.listProjectsWithCounts).not.toHaveBeenCalled();
  });

  test("GET lists projects with role and counts", async () => {
    projectServiceMock.listProjectsWithCounts.mockResolvedValueOnce([
      {
        id: "project-owner",
        name: "Owned project",
        description: "Owner visible",
        ownerId: "user-1",
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        memberships: [],
        _count: {
          tasks: 2,
          resources: 3,
        },
      },
      {
        id: "project-shared",
        name: "Shared project",
        description: null,
        ownerId: "user-2",
        updatedAt: new Date("2026-05-02T10:00:00.000Z"),
        memberships: [{ role: "editor" }],
        _count: {
          tasks: 5,
          resources: 1,
        },
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/projects"));

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      projects: [
        {
          id: "project-owner",
          name: "Owned project",
          description: "Owner visible",
          ownerId: "user-1",
          role: "owner",
          updatedAt: "2026-05-01T10:00:00.000Z",
          counts: {
            tasks: 2,
            contextCards: 3,
          },
        },
        {
          id: "project-shared",
          name: "Shared project",
          description: null,
          ownerId: "user-2",
          role: "editor",
          updatedAt: "2026-05-02T10:00:00.000Z",
          counts: {
            tasks: 5,
            contextCards: 1,
          },
        },
      ],
    });
    expect(projectServiceMock.listProjectsWithCounts).toHaveBeenCalledWith("user-1");
  });

  test("POST validates invalid json payloads", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
    expect(projectServiceMock.createProject).not.toHaveBeenCalled();
  });

  test("POST creates a project through the project service", async () => {
    projectServiceMock.createProject.mockResolvedValueOnce({
      id: "project-1",
      name: "API Project",
      description: "Created from API",
      ownerId: "user-1",
      createdAt: new Date("2026-05-03T08:00:00.000Z"),
      updatedAt: new Date("2026-05-03T08:30:00.000Z"),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "  API Project  ",
          description: "  Created from API  ",
        }),
      })
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      project: {
        id: "project-1",
        name: "API Project",
        description: "Created from API",
        ownerId: "user-1",
        createdAt: "2026-05-03T08:00:00.000Z",
        updatedAt: "2026-05-03T08:30:00.000Z",
      },
    });
    expect(projectServiceMock.createProject).toHaveBeenCalledWith({
      actorUserId: "user-1",
      name: "API Project",
      description: "Created from API",
    });
  });
});
