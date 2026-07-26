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
    findMany: vi.fn(),
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
  getWorkspaceMeetingTodoNavigationSummary,
  listWorkspaceMeetingTodos,
} from "@/lib/services/workspace-meeting-todo-service";

const referenceNowMs = new Date("2026-07-20T12:00:00.000Z").getTime();

describe("workspace meeting todo service", () => {
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

  test("aggregates only actor-visible projects and sorts overdue and recent work", async () => {
    dbMock.project.findMany.mockResolvedValueOnce([
      {
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
      },
      {
        id: "project-viewer",
        name: "Beta",
        ownerId: "user-2",
        memberships: [{ role: "viewer" }],
        meetingNotes: [
          {
            id: "meeting-new",
            title: "Risk review",
            scheduledAt: new Date("2026-07-18T09:00:00.000Z"),
            status: "actions_in_progress",
            createdAt: new Date("2026-07-18T08:00:00.000Z"),
            actions: [
              {
                id: "todo-current",
                content: "Review the open risks",
                completedAt: null,
                updatedAt: new Date("2026-07-18T10:00:00.000Z"),
              },
              {
                id: "todo-completed-recent",
                content: "Share the risk register",
                completedAt: new Date("2026-07-20T10:00:00.000Z"),
                updatedAt: new Date("2026-07-20T10:00:00.000Z"),
              },
            ],
          },
        ],
      },
    ]);

    const result = await listWorkspaceMeetingTodos({
      actorUserId: " user-1 ",
      referenceNowMs,
    });

    expect(result.open.map((todo) => todo.id)).toEqual([
      "todo-overdue",
      "todo-current",
    ]);
    expect(result.open[0]).toMatchObject({
      isOverdue: true,
      project: {
        id: "project-owned",
        role: "owner",
        canEdit: true,
      },
    });
    expect(result.open[1]).toMatchObject({
      isOverdue: false,
      project: {
        id: "project-viewer",
        role: "viewer",
        canEdit: false,
      },
    });
    expect(result.completed.map((todo) => todo.id)).toEqual([
      "todo-completed-recent",
      "todo-completed",
    ]);
    expect(rlsContextMock.withActorRlsContext).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function)
    );
    expect(projectAccessServiceMock.buildProjectPrincipalWhere).toHaveBeenCalledWith(
      "user-1"
    );
  });

  test("returns the navigation count from open accessible actions", async () => {
    dbMock.project.findMany.mockResolvedValueOnce([
      {
        meetingNotes: [
          {
            scheduledAt: new Date("2026-07-01T09:00:00.000Z"),
            status: "actions_in_progress",
            _count: { actions: 2 },
          },
          {
            scheduledAt: new Date("2026-07-01T09:00:00.000Z"),
            status: "done",
            _count: { actions: 1 },
          },
        ],
      },
    ]);

    const result = await getWorkspaceMeetingTodoNavigationSummary("user-1");

    expect(result.openCount).toBe(3);
    expect(result.overdueCount).toBe(2);
    expect(dbMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
        select: {
          meetingNotes: expect.objectContaining({
            where: { actions: { some: { completedAt: null } } },
            select: expect.objectContaining({
              scheduledAt: true,
              status: true,
              _count: {
                select: {
                  actions: {
                    where: { completedAt: null },
                  },
                },
              },
            }),
          }),
        },
      })
    );
  });

  test("does not enter RLS context without an actor", async () => {
    await expect(
      listWorkspaceMeetingTodos({ actorUserId: " " })
    ).resolves.toEqual({ open: [], completed: [] });
    await expect(
      getWorkspaceMeetingTodoNavigationSummary("")
    ).resolves.toEqual({ openCount: 0, overdueCount: 0 });
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });
});
