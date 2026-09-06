import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));
const taskSearchServiceMock = vi.hoisted(() => ({
  searchProjectTaskIds: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));
vi.mock("@/lib/services/project-task-search-service", () => ({
  searchProjectTaskIds: taskSearchServiceMock.searchProjectTaskIds,
}));

import { GET } from "@/app/api/projects/[projectId]/tasks/search/route";

describe("task search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
    taskSearchServiceMock.searchProjectTaskIds.mockResolvedValue({
      ok: true,
      data: { taskIds: ["task-1", "task-2"] },
    });
  });

  test("returns only task IDs from the human-session service", async () => {
    const request = new NextRequest(
      "http://localhost/api/projects/project-1/tasks/search?q=%20Launch%20"
    );
    const response = await GET(request, {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      taskIds: ["task-1", "task-2"],
    });
    expect(taskSearchServiceMock.searchProjectTaskIds).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      query: " Launch ",
    });
  });

  test("rejects missing human authentication before search", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search?q=test"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(401);
    expect(taskSearchServiceMock.searchProjectTaskIds).not.toHaveBeenCalled();
  });

  test("preserves service validation and authorization failures", async () => {
    taskSearchServiceMock.searchProjectTaskIds.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "query-required",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project-1/tasks/search"),
      { params: Promise.resolve({ projectId: "project-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "query-required" });
  });
});
