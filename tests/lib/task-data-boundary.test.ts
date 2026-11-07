import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => {
  const events: string[] = [];
  const db = {
    $queryRaw: vi.fn(),
    task: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    taskBlockedFollowUp: { create: vi.fn() },
    taskRelation: { createMany: vi.fn(), deleteMany: vi.fn() },
  };
  return { events, db, context: vi.fn(), activity: vi.fn(), authorize: vi.fn() };
});

// No usable global delegate: accidentally losing the caller's client fails here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/rls-context", () => ({ withActorRlsContext: state.context }));
vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: state.authorize,
  requireAgentProjectScopes: () => ({ ok: true }),
}));
vi.mock("@/lib/services/project-activity-service", () => ({ recordProjectActivityEvent: state.activity }));

import { updateTaskForProject } from "@/lib/services/project-task-service";

const person = { id: "owner", name: "Owner", email: null, username: null, usernameDiscriminator: null, avatarSeed: null };
const storedTask = {
  id: "task", projectId: "project", contentRevision: 3, referenceNumber: 1,
  title: "Stored title", description: null, label: null, labelsJson: null,
  deadlineAt: null, blockedNote: null, status: "Blocked", position: 0,
  completedAt: null, archivedAt: null, epicId: null, epic: null,
  createdAt: new Date(), updatedAt: new Date(),
  assigneeKind: null, assigneeAssignedByKind: null, assigneeAssignedAt: null,
  createdByUser: person, updatedByUser: person,
  _count: { comments: 0 }, attachments: [], blockedFollowUps: [],
  outgoingRelations: [], incomingRelations: [],
};

describe("Task application/data collaboration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.events.length = 0;
    state.context.mockImplementation(async (_actor, operation) => operation(state.db));
    state.authorize.mockImplementation(async ({ db }) => {
      expect(db).toBe(state.db);
      state.events.push("authorize");
      return { ok: true };
    });
    state.db.$queryRaw.mockImplementation(async () => {
      state.events.push("lock");
      return [{ contentRevision: 3 }];
    });
    state.db.task.findUnique.mockImplementation(async () => {
      state.events.push("read");
      return storedTask;
    });
    state.db.task.findMany.mockImplementation(async () => {
      state.events.push("validate relations");
      return [{ id: "related" }];
    });
    state.db.task.update.mockImplementation(async () => { state.events.push("edit"); });
    state.db.taskBlockedFollowUp.create.mockImplementation(async () => { state.events.push("follow-up"); });
    state.db.taskRelation.createMany.mockImplementation(async () => { state.events.push("relations"); });
    state.activity.mockImplementation(async ({ db }) => {
      expect(db).toBe(state.db);
      state.events.push("activity");
    });
  });

  test("keeps authorization, revision locking, edits, children, hydration and activity on the caller's client in order", async () => {
    const result = await updateTaskForProject("project", "task", {
      title: "New title", blockedFollowUpEntry: "Waiting for supplier",
      addRelatedTaskIds: ["related"],
    }, "owner", undefined, 3);
    expect(result.ok).toBe(true);
    expect(state.context).toHaveBeenCalledWith("owner", expect.any(Function), { forceTransaction: true });
    expect(state.events).toEqual([
      "authorize", "lock", "read", "validate relations", "edit", "follow-up", "relations", "read", "activity",
    ]);
    expect(state.db.task.update).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ title: "New title" }) });
    expect(state.db.task.findUnique.mock.calls[1][0].select.attachments.where).toEqual({ isCommentDraft: false });
  });

  test("hydrates a revision conflict without issuing writes or activity", async () => {
    const result = await updateTaskForProject("project", "task", { title: "Stale edit" }, "owner", undefined, 2);
    expect(result).toMatchObject({ ok: false, status: 412, error: "edit-conflict", current: { id: "task", contentRevision: 3 } });
    expect(state.events).toEqual(["authorize", "lock", "read"]);
  });

  test("refuses a foreign project's unique-id record before editing", async () => {
    state.db.task.findUnique.mockResolvedValue({ ...storedTask, projectId: "other-project" });
    const result = await updateTaskForProject("project", "task", { title: "Foreign edit" }, "owner");
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(state.db.task.update).not.toHaveBeenCalled();
    expect(state.activity).not.toHaveBeenCalled();
  });

  test("does not publish activity when a child write fails", async () => {
    state.db.taskBlockedFollowUp.create.mockRejectedValue(new Error("database unavailable"));
    const result = await updateTaskForProject("project", "task", { blockedFollowUpEntry: "Follow-up" }, "owner", undefined, 3);
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(state.db.task.findUnique).toHaveBeenCalledTimes(1);
    expect(state.activity).not.toHaveBeenCalled();
  });
});
