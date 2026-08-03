import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const todoServiceMock = vi.hoisted(() => ({
  getProjectMeetingTodoNavigationSummary: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-meeting-todo-service", () => ({
  getProjectMeetingTodoNavigationSummary:
    todoServiceMock.getProjectMeetingTodoNavigationSummary,
}));

import { GET } from "@/app/api/projects/[projectId]/meeting-todos/summary/route";

const request = new NextRequest(
  "http://localhost/api/projects/project-1/meeting-todos/summary"
);
const params = { params: Promise.resolve({ projectId: "project-1" }) };

describe("project meeting todo summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("returns a no-store project-scoped summary", async () => {
    todoServiceMock.getProjectMeetingTodoNavigationSummary.mockResolvedValue({
      activeCount: 3,
      hasOverdue: true,
    });

    const response = await GET(request, params);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      activeCount: 3,
      hasOverdue: true,
    });
    expect(
      todoServiceMock.getProjectMeetingTodoNavigationSummary
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
    });
  });

  test("preserves authentication failures", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(request, params);

    expect(response.status).toBe(401);
    expect(
      todoServiceMock.getProjectMeetingTodoNavigationSummary
    ).not.toHaveBeenCalled();
  });

  test("does not expose an unauthorized project", async () => {
    todoServiceMock.getProjectMeetingTodoNavigationSummary.mockResolvedValueOnce(
      null
    );

    const response = await GET(request, params);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "project-not-found",
    });
  });
});
