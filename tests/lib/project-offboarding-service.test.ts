import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  task: { count: vi.fn(), updateMany: vi.fn() },
  resource: { count: vi.fn(), updateMany: vi.fn() },
  projectMeetingNote: { count: vi.fn(), updateMany: vi.fn() },
  projectMeetingNoteAction: {
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  taskAssigneeChange: { createMany: vi.fn() },
  projectMeetingNoteActionAssigneeChange: { createMany: vi.fn() },
  user: { findUnique: vi.fn() },
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

interface SnapshotState {
  tasks: Array<Record<string, unknown>>;
  todoActions: Array<Record<string, unknown>>;
  functionResult: string;
}

let snapshotState: SnapshotState;

function sqlText(query: unknown): string {
  const strings = (query as { strings?: unknown }).strings;
  return Array.isArray(strings) ? strings.join("?") : String(query);
}

function queryRawCallContaining(fragment: string): { values: unknown[] } {
  const call = dbMock.$queryRaw.mock.calls.find(([query]) =>
    sqlText(query).includes(fragment)
  );
  if (!call) {
    throw new Error(`No $queryRaw call contained: ${fragment}`);
  }
  return call[0] as { values: unknown[] };
}

describe("project-offboarding-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotState = { tasks: [], todoActions: [], functionResult: "ok" };
    accessMock.requireProjectRole.mockResolvedValue({
      ok: true,
      status: 200,
      data: { role: "owner" },
    });
    dbMock.task.count.mockResolvedValue(0);
    dbMock.resource.count.mockResolvedValue(0);
    dbMock.projectMeetingNote.count.mockResolvedValue(0);
    dbMock.projectMeetingNoteAction.count.mockResolvedValue(0);
    dbMock.user.findUnique.mockResolvedValue({
      name: "Acting Owner",
      username: null,
      usernameDiscriminator: null,
      email: "acting-owner@example.com",
    });
    dbMock.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query);
      if (
        sql.includes("resolve_project_actor_responsibilities") ||
        sql.includes("transfer_project_ownership")
      ) {
        return [{ result: snapshotState.functionResult }];
      }
      if (sql.includes("FOR UPDATE OF action")) {
        return snapshotState.todoActions;
      }
      if (sql.includes('FROM "Task"')) {
        return snapshotState.tasks;
      }
      throw new Error(`Unexpected $queryRaw: ${sql}`);
    });
    dbMock.task.updateMany.mockResolvedValue({ count: 0 });
    dbMock.resource.updateMany.mockResolvedValue({ count: 0 });
    dbMock.projectMeetingNote.updateMany.mockResolvedValue({ count: 0 });
    dbMock.projectMeetingNoteAction.updateMany.mockResolvedValue({ count: 0 });
    dbMock.taskAssigneeChange.createMany.mockResolvedValue({ count: 0 });
    dbMock.projectMeetingNoteActionAssigneeChange.createMany.mockResolvedValue({
      count: 0,
    });
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

  test("counts agent assignments by credential identity", async () => {
    dbMock.task.count.mockResolvedValueOnce(1);

    const inventory = await countActiveProjectResponsibilities(
      dbMock as never,
      "project-1",
      { kind: "agent", id: "credential-1" }
    );

    expect(inventory.taskAssignments).toBe(1);
    expect(dbMock.task.count).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        assigneeKind: "agent",
        assigneeCredentialId: "credential-1",
        archivedAt: null,
        NOT: { status: "Done" },
      },
    });
  });

  test("requires a fresh explicit choice when active responsibility remains", async () => {
    dbMock.resource.count.mockResolvedValueOnce(1);

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "agent", id: "credential-1" },
      actingUserId: "owner-1",
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
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  test("reassigns responsibility and records provenance plus append-only history", async () => {
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
    snapshotState.tasks = [
      {
        id: "task-1",
        assigneeKind: "agent",
        assigneeUserId: null,
        assigneeCredentialId: "credential-2",
        assigneeDisplayNameSnapshot: "Assistant bot",
      },
    ];
    snapshotState.todoActions = [
      {
        id: "action-1",
        assigneeKind: "human",
        assigneeUserId: "user-1",
        assigneeCredentialId: null,
        assigneeDisplayNameSnapshot: "Departing Editor",
      },
    ];

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "human", id: "user-1" },
      actingUserId: "owner-1",
      resolution: { mode: "reassign", replacementUserId: "owner-1" },
    });

    expect(result.ok).toBe(true);
    expect(queryRawCallContaining('FROM "Task"').values).toEqual([
      "project-1",
      "user-1",
      "user-1",
      null,
    ]);
    expect(queryRawCallContaining("FOR UPDATE OF action").values).toEqual([
      "project-1",
      "human",
      "user-1",
      "user-1",
      null,
      null,
    ]);
    expect(
      queryRawCallContaining("resolve_project_actor_responsibilities").values
    ).toEqual(["project-1", "human", "user-1", "reassign", "owner-1"]);
    expect(dbMock.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1"] } },
      data: {
        assigneeAssignedByKind: "human",
        assigneeAssignedByUserId: "owner-1",
        assigneeAssignedByCredentialId: null,
        assigneeAssignedByDisplayNameSnapshot: "Acting Owner",
        assigneeAssignedAt: expect.any(Date),
      },
    });
    expect(dbMock.taskAssigneeChange.createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "task-1",
          previousAssigneeKind: "agent",
          previousAssigneeUserId: null,
          previousAssigneeCredentialId: "credential-2",
          previousAssigneeDisplayNameSnapshot: "Assistant bot",
          nextAssigneeKind: "human",
          nextAssigneeUserId: "owner-1",
          nextAssigneeCredentialId: null,
          nextAssigneeDisplayNameSnapshot: "Project Owner",
          changedByKind: "human",
          changedByUserId: "owner-1",
          changedByCredentialId: null,
          changedByDisplayNameSnapshot: "Acting Owner",
          createdAt: expect.any(Date),
        },
      ],
    });
    expect(dbMock.projectMeetingNoteAction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["action-1"] } },
      data: {
        assignedByKind: "human",
        assignedByUserId: "owner-1",
        assignedByCredentialId: null,
        assignedByDisplayNameSnapshot: "Acting Owner",
        assignedAt: expect.any(Date),
      },
    });
    expect(
      dbMock.projectMeetingNoteActionAssigneeChange.createMany
    ).toHaveBeenCalledWith({
      data: [
        {
          actionId: "action-1",
          previousAssigneeKind: "human",
          previousAssigneeUserId: "user-1",
          previousAssigneeCredentialId: null,
          previousAssigneeDisplayNameSnapshot: "Departing Editor",
          nextAssigneeKind: "human",
          nextAssigneeUserId: "owner-1",
          nextAssigneeCredentialId: null,
          nextAssigneeDisplayNameSnapshot: "Project Owner",
          changedByKind: "human",
          changedByUserId: "owner-1",
          changedByCredentialId: null,
          changedByDisplayNameSnapshot: "Acting Owner",
          createdAt: expect.any(Date),
        },
      ],
    });
    expect(dbMock.resource.updateMany).not.toHaveBeenCalled();
    expect(dbMock.projectMeetingNote.updateMany).not.toHaveBeenCalled();
  });

  test("unassignment clears assignees but retains change history", async () => {
    dbMock.task.count.mockResolvedValueOnce(1);
    snapshotState.tasks = [
      {
        id: "task-1",
        assigneeKind: "human",
        assigneeUserId: "user-1",
        assigneeCredentialId: null,
        assigneeDisplayNameSnapshot: "Departing Editor",
      },
    ];

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "human", id: "user-1" },
      actingUserId: "owner-1",
      resolution: { mode: "unassign" },
    });

    expect(result.ok).toBe(true);
    expect(
      queryRawCallContaining("resolve_project_actor_responsibilities").values
    ).toEqual(["project-1", "human", "user-1", "unassign", null]);
    expect(dbMock.taskAssigneeChange.createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "task-1",
          previousAssigneeKind: "human",
          previousAssigneeUserId: "user-1",
          previousAssigneeCredentialId: null,
          previousAssigneeDisplayNameSnapshot: "Departing Editor",
          nextAssigneeKind: null,
          nextAssigneeUserId: null,
          nextAssigneeCredentialId: null,
          nextAssigneeDisplayNameSnapshot: null,
          changedByKind: "human",
          changedByUserId: "owner-1",
          changedByCredentialId: null,
          changedByDisplayNameSnapshot: "Acting Owner",
          createdAt: expect.any(Date),
        },
      ],
    });
    expect(dbMock.projectMeetingNoteActionAssigneeChange.createMany).not.toHaveBeenCalled();
  });

  test("skips assignment bookkeeping when only stewardships remain", async () => {
    dbMock.resource.count.mockResolvedValueOnce(1);

    const result = await resolveActiveProjectResponsibilities({
      db: dbMock as never,
      projectId: "project-1",
      actor: { kind: "agent", id: "credential-1" },
      actingUserId: "owner-1",
      resolution: { mode: "unassign" },
    });

    expect(result.ok).toBe(true);
    expect(dbMock.task.updateMany).not.toHaveBeenCalled();
    expect(dbMock.taskAssigneeChange.createMany).not.toHaveBeenCalled();
    expect(dbMock.projectMeetingNoteAction.updateMany).not.toHaveBeenCalled();
    expect(
      dbMock.projectMeetingNoteActionAssigneeChange.createMany
    ).not.toHaveBeenCalled();
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
