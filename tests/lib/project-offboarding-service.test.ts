import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  task: { count: vi.fn(), updateMany: vi.fn() },
  resource: { count: vi.fn(), updateMany: vi.fn() },
  projectMeetingNote: { count: vi.fn(), updateMany: vi.fn() },
  projectMeetingNoteAction: { count: vi.fn(), updateMany: vi.fn() },
  project: { findUnique: vi.fn() },
  projectMembership: { findFirst: vi.fn(), findUnique: vi.fn() },
  apiCredential: { findFirst: vi.fn() },
}));

const accessMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(
    async (_actorUserId: string, callback: (db: typeof dbMock) => unknown) =>
      callback(dbMock)
  ),
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: accessMock.requireProjectRole,
}));

import {
  countActiveProjectResponsibilities,
  getProjectResponsibilityInventory,
  parseResponsibilityResolution,
  resolveActiveProjectResponsibilities,
  transferProjectOwnership,
} from "@/lib/services/project-offboarding-service";

describe("project-offboarding-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.requireProjectRole.mockResolvedValue({
      ok: true,
      status: 200,
      data: { role: "owner" },
    });
    dbMock.task.count.mockResolvedValue(0);
    dbMock.resource.count.mockResolvedValue(0);
    dbMock.projectMeetingNote.count.mockResolvedValue(0);
    dbMock.projectMeetingNoteAction.count.mockResolvedValue(0);
    dbMock.task.updateMany.mockResolvedValue({ count: 0 });
    dbMock.resource.updateMany.mockResolvedValue({ count: 0 });
    dbMock.projectMeetingNote.updateMany.mockResolvedValue({ count: 0 });
    dbMock.projectMeetingNoteAction.updateMany.mockResolvedValue({ count: 0 });
  });

  test("parses only explicit responsibility resolutions", () => {
    expect(parseResponsibilityResolution({ mode: "unassign" })).toEqual({
      mode: "unassign",
    });
    expect(
      parseResponsibilityResolution({
        mode: "reassign",
        replacementUserId: "  user-2  ",
      })
    ).toEqual({ mode: "reassign", replacementUserId: "user-2" });
    expect(parseResponsibilityResolution({ mode: "reassign" })).toBeNull();
    expect(parseResponsibilityResolution({ mode: "delete" })).toBeNull();
  });

  test("counts each active responsibility category without historical work", async () => {
    dbMock.task.count.mockResolvedValueOnce(2);
    dbMock.resource.count.mockResolvedValueOnce(3);
    dbMock.projectMeetingNote.count.mockResolvedValueOnce(4);
    dbMock.projectMeetingNoteAction.count.mockResolvedValueOnce(5);

    const inventory = await countActiveProjectResponsibilities(
      dbMock as never,
      "project-1",
      { kind: "human", id: "user-1" }
    );

    expect(inventory).toEqual({
      taskAssignments: 2,
      contextCardStewardships: 3,
      meetingNoteStewardships: 4,
      meetingTodoAssignments: 5,
      total: 14,
    });
    expect(dbMock.task.count).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        assigneeUserId: "user-1",
        archivedAt: null,
        NOT: { status: "Done" },
      },
    });
    expect(dbMock.projectMeetingNoteAction.count).toHaveBeenCalledWith({
      where: {
        meetingNote: { projectId: "project-1" },
        completedAt: null,
        assigneeKind: "human",
        assigneeUserId: "user-1",
      },
    });
  });

  test("requires a fresh explicit choice when active responsibility remains", async () => {
    dbMock.resource.count.mockResolvedValueOnce(1);

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "agent", id: "credential-1" },
      resolution: null,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "responsibility-resolution-required",
      inventory: {
        taskAssignments: 0,
        contextCardStewardships: 1,
        meetingNoteStewardships: 0,
        meetingTodoAssignments: 0,
        total: 1,
      },
    });
    expect(dbMock.resource.updateMany).not.toHaveBeenCalled();
  });

  test("reassigns only active fields and keeps provenance fields untouched", async () => {
    dbMock.task.count.mockResolvedValueOnce(1);
    dbMock.resource.count.mockResolvedValueOnce(1);
    dbMock.projectMeetingNote.count.mockResolvedValueOnce(1);
    dbMock.projectMeetingNoteAction.count.mockResolvedValueOnce(1);
    dbMock.project.findUnique.mockResolvedValueOnce({
      ownerId: "owner-1",
      owner: {
        id: "owner-1",
        name: "Project Owner",
        username: null,
        usernameDiscriminator: null,
        email: "owner@example.com",
      },
      memberships: [],
    });

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "human", id: "user-1" },
      resolution: { mode: "reassign", replacementUserId: "owner-1" },
    });

    expect(result.ok).toBe(true);
    expect(dbMock.task.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        assigneeUserId: "user-1",
        archivedAt: null,
        NOT: { status: "Done" },
      },
      data: { assigneeUserId: "owner-1" },
    });
    expect(dbMock.projectMeetingNote.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        stewardKind: "human",
        NOT: { status: "done" },
        stewardUserId: "user-1",
      },
      data: {
        stewardKind: "human",
        stewardUserId: "owner-1",
        stewardCredentialId: null,
        stewardDisplayNameSnapshot: "Project Owner",
      },
    });
    expect(dbMock.projectMeetingNoteAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          completedByUserId: expect.anything(),
        }),
      })
    );
  });

  test("rejects actors outside the project", async () => {
    dbMock.projectMembership.findFirst.mockResolvedValueOnce(null);

    const result = await getProjectResponsibilityInventory({
      actorUserId: "owner-1",
      projectId: "project-1",
      actorKind: "human",
      actorId: "other-project-user",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "actor-not-found",
    });
  });

  test("rejects cross-project ownership targets", async () => {
    dbMock.projectMembership.findUnique.mockResolvedValueOnce({
      projectId: "project-2",
      userId: "user-2",
    });

    const result = await transferProjectOwnership({
      actorUserId: "owner-1",
      projectId: "project-1",
      newOwnerMembershipId: "membership-2",
      previousOwnerLeaves: false,
      responsibilityResolution: null,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "new-owner-not-member",
    });
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  test("transfers ownership to a current project member", async () => {
    dbMock.projectMembership.findUnique.mockResolvedValueOnce({
      projectId: "project-1",
      userId: "user-2",
    });
    dbMock.$queryRaw.mockResolvedValueOnce([{ result: "ok" }]);

    const result = await transferProjectOwnership({
      actorUserId: "owner-1",
      projectId: "project-1",
      newOwnerMembershipId: "membership-2",
      previousOwnerLeaves: false,
      responsibilityResolution: null,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        projectId: "project-1",
        newOwnerUserId: "user-2",
        previousOwnerLeft: false,
        resolvedInventory: {
          taskAssignments: 0,
          contextCardStewardships: 0,
          meetingNoteStewardships: 0,
          meetingTodoAssignments: 0,
          total: 0,
        },
      },
    });
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
