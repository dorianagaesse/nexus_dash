import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  buildProjectPrincipalWhere: vi.fn(),
  hasRequiredRole: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere:
    projectAccessServiceMock.buildProjectPrincipalWhere,
  hasRequiredRole: projectAccessServiceMock.hasRequiredRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

import {
  getProjectMeetingTodoNavigationSummary,
  listProjectMeetingTodos,
} from "@/lib/services/project-meeting-todo-service";

const referenceNowMs = new Date("2026-07-20T12:00:00.000Z").getTime();

describe("project meeting todo service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessServiceMock.buildProjectPrincipalWhere.mockReturnValue({
      OR: [
        { ownerId: "user-1" },
        { memberships: { some: { userId: "user-1" } } },
      ],
    });
    projectAccessServiceMock.hasRequiredRole.mockImplementation(
      (role: string) => role === "owner" || role === "editor"
    );
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
  });

  test("loads only the requested authorized project and sorts its todos", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      id: "project-owned",
      name: "Alpha",
      ownerId: "user-1",
      memberships: [],
      meetingNotes: [
        {
          id: "meeting-old",
          title: "Launch review",
          scheduledAt: new Date("2026-07-10T09:00:00.000Z"),
          status: "actions_in_progress",
          createdAt: new Date("2026-07-10T08:00:00.000Z"),
          actions: [
            {
              id: "todo-current",
              content: "Review the open risks",
              completedAt: null,
              updatedAt: new Date("2026-07-18T10:00:00.000Z"),
            },
            {
              id: "todo-overdue",
              content: "Send the launch recap",
              completedAt: null,
              updatedAt: new Date("2026-07-10T10:00:00.000Z"),
            },
            {
              id: "todo-completed",
              content: "Confirm the launch window",
              completedAt: new Date("2026-07-19T10:00:00.000Z"),
              updatedAt: new Date("2026-07-19T10:00:00.000Z"),
            },
          ],
        },
      ],
    });

    const result = await listProjectMeetingTodos({
      actorUserId: " user-1 ",
      projectId: " project-owned ",
      referenceNowMs,
    });

    expect(result?.project).toEqual({
      id: "project-owned",
      name: "Alpha",
      role: "owner",
      canEdit: true,
    });
    expect(result?.open.map((todo) => todo.id)).toEqual([
      "todo-current",
      "todo-overdue",
    ]);
    expect(result?.open.every((todo) => todo.isOverdue)).toBe(true);
    expect(result?.completed.map((todo) => todo.id)).toEqual([
      "todo-completed",
    ]);
    expect(dbMock.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "project-owned",
          OR: expect.any(Array),
        },
      })
    );
    expect(rlsContextMock.withActorRlsContext).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function)
    );
  });

  test("returns view-only permissions for a viewer membership", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      id: "project-viewer",
      name: "Beta",
      ownerId: "user-2",
      memberships: [{ role: "viewer" }],
      meetingNotes: [],
    });

    const result = await listProjectMeetingTodos({
      actorUserId: "user-1",
      projectId: "project-viewer",
    });

    expect(result?.project).toMatchObject({
      id: "project-viewer",
      role: "viewer",
      canEdit: false,
    });
  });

  test("returns null when identifiers are missing or the project is unauthorized", async () => {
    await expect(
      listProjectMeetingTodos({ actorUserId: " ", projectId: "project-1" })
    ).resolves.toBeNull();
    await expect(
      listProjectMeetingTodos({ actorUserId: "user-1", projectId: " " })
    ).resolves.toBeNull();
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();

    dbMock.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      listProjectMeetingTodos({
        actorUserId: "user-1",
        projectId: "project-other",
      })
    ).resolves.toBeNull();
  });

  test("list omits overdue for todos inside the one-day grace window", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      id: "project-owned",
      name: "Alpha",
      ownerId: "user-1",
      memberships: [],
      meetingNotes: [
        {
          id: "meeting-fresh",
          title: "Daily standup",
          scheduledAt: new Date(referenceNowMs - 30 * 60 * 1000),
          status: "actions_in_progress",
          createdAt: new Date(referenceNowMs - 30 * 60 * 1000),
          actions: [
            {
              id: "todo-fresh",
              content: "Send the standup notes",
              completedAt: null,
              updatedAt: new Date(referenceNowMs - 30 * 60 * 1000),
            },
          ],
        },
      ],
    });

    const result = await listProjectMeetingTodos({
      actorUserId: "user-1",
      projectId: "project-owned",
      referenceNowMs,
    });

    expect(result?.open.map((todo) => todo.isOverdue)).toEqual([false]);
  });

  test("summarizes active and overdue todos without selecting todo content", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      id: "project-owned",
      meetingNotes: [
        {
          scheduledAt: new Date("2026-07-10T09:00:00.000Z"),
          status: "actions_in_progress",
          actions: [{ id: "todo-1" }, { id: "todo-2" }],
        },
        {
          scheduledAt: new Date("2026-07-19T09:00:00.000Z"),
          status: "actions_in_progress",
          actions: [{ id: "todo-3" }],
        },
        {
          scheduledAt: new Date("2026-07-01T09:00:00.000Z"),
          status: "done",
          actions: [{ id: "todo-archived" }],
        },
      ],
    });

    await expect(
      getProjectMeetingTodoNavigationSummary({
        actorUserId: " user-1 ",
        projectId: " project-owned ",
        referenceNowMs,
      })
    ).resolves.toEqual({ activeCount: 4, hasOverdue: true });

    expect(dbMock.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-owned",
        OR: expect.any(Array),
      },
      select: {
        id: true,
        meetingNotes: {
          select: {
            scheduledAt: true,
            status: true,
            actions: {
              where: { completedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });
  });

  test("returns zero summary for an authorized project without active todos", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      id: "project-empty",
      meetingNotes: [],
    });

    await expect(
      getProjectMeetingTodoNavigationSummary({
        actorUserId: "user-1",
        projectId: "project-empty",
        referenceNowMs,
      })
    ).resolves.toEqual({ activeCount: 0, hasOverdue: false });
  });
});
