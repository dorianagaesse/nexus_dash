import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  task: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  taskRelation: { deleteMany: vi.fn(), createMany: vi.fn() },
  apiCredential: { findFirst: vi.fn() },
}));
const auth = vi.hoisted(() => ({
  requireApiPrincipal: vi.fn(),
  getAgentProjectAccessContext: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => auth);
vi.mock("@/lib/services/project-activity-service", () => ({
  recordProjectActivityEvent: vi.fn().mockResolvedValue(new Date()),
}));
vi.mock("@/lib/project-activity-event-response", () => ({
  recordProjectActivityEventVersion: vi.fn().mockResolvedValue(new Date()),
}));

import { PATCH } from "@/app/api/projects/[projectId]/tasks/[taskId]/route";

const agentAccess = {
  credentialId: "codex",
  projectId: "p1",
  scopes: ["task:write"] as const,
};

function patch(payload: unknown) {
  return PATCH(
    new Request("http://localhost/api/projects/p1/tasks/t2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }) as never,
    { params: Promise.resolve({ projectId: "p1", taskId: "t2" }) }
  );
}

describe("additive task relation PATCH", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: { kind: "agent", actorUserId: "owner", ...agentAccess },
    });
    auth.getAgentProjectAccessContext.mockReturnValue(agentAccess);
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [] });
    db.apiCredential.findFirst.mockResolvedValue({ id: "codex", label: "Codex" });
    db.task.findMany.mockResolvedValue([{ id: "t3" }]);
    db.task.findUnique.mockResolvedValue({
      id: "t2", projectId: "p1", referenceNumber: 2,
      title: "Preserve this title", description: "Preserve this body",
      label: "feature", labelsJson: '["feature"]', status: "Backlog", position: 0,
      archivedAt: null, completedAt: null, deadlineAt: null, epicId: null,
      createdAt: new Date(), updatedAt: new Date(),
      createdByUser: { id: "owner", name: "Owner" },
      updatedByUser: { id: "owner", name: "Owner" },
      _count: { comments: 0 }, attachments: [], blockedFollowUps: [],
      outgoingRelations: [{ rightTaskId: "t4", rightTask: {
        id: "t4", title: "Existing archived edge", status: "Done", archivedAt: new Date(),
      } }],
      incomingRelations: [{ leftTaskId: "t1", leftTask: {
        id: "t1", title: "Existing incoming edge", status: "Backlog", archivedAt: null,
      } }],
    });
  });

  test("adds only canonical pairs and preserves existing archived and incoming relations", async () => {
    const response = await patch({ addRelatedTaskIds: [" t3 ", "t3"] });
    expect(response.status).toBe(200);
    expect(db.taskRelation.deleteMany).not.toHaveBeenCalled();
    expect(db.taskRelation.createMany).toHaveBeenCalledWith({
      data: [{ projectId: "p1", leftTaskId: "t2", rightTaskId: "t3" }],
      skipDuplicates: true,
    });
    const { task } = await response.json();
    expect(task.title).toBe("Preserve this title");
    expect(task.relatedTasks.map((entry: { id: string }) => entry.id).sort()).toEqual(["t1", "t4"]);
    expect(db.task.update.mock.calls[0][0].data).not.toHaveProperty("title");
  });

  test("removes only requested pairs in either direction without looking up target tasks", async () => {
    const response = await patch({ removeRelatedTaskIds: [" t1 ", "t4", "missing", "t1"] });
    expect(response.status).toBe(200);
    expect(db.task.findMany).not.toHaveBeenCalled();
    expect(db.taskRelation.createMany).not.toHaveBeenCalled();
    expect(db.taskRelation.deleteMany).toHaveBeenCalledWith({ where: {
      projectId: "p1",
      OR: [
        { leftTaskId: "t1", rightTaskId: "t2" },
        { leftTaskId: "t2", rightTaskId: "t4" },
        { leftTaskId: "missing", rightTaskId: "t2" },
      ],
    } });
  });

  test("can add and remove different pairs together", async () => {
    const response = await patch({ addRelatedTaskIds: ["t3"], removeRelatedTaskIds: ["t1"] });
    expect(response.status).toBe(200);
    expect(db.taskRelation.deleteMany).toHaveBeenCalled();
    expect(db.taskRelation.createMany).toHaveBeenCalled();
  });

  test("permits an idempotent add of an already-linked archived task", async () => {
    db.task.findMany.mockResolvedValue([{ id: "t4" }]);
    expect((await patch({ addRelatedTaskIds: ["t4"] })).status).toBe(200);
    expect(db.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: { in: ["t4"] }, projectId: "p1",
      OR: [{ archivedAt: null }, { id: { in: ["t4", "t1"] } }],
    } }));
  });

  test("empty additive arrays leave all relation pairs alone", async () => {
    expect((await patch({ addRelatedTaskIds: [], removeRelatedTaskIds: [] })).status).toBe(200);
    expect(db.taskRelation.createMany).not.toHaveBeenCalled();
    expect(db.taskRelation.deleteMany).not.toHaveBeenCalled();
  });

  test.each([
    [{ relatedTaskIds: [], addRelatedTaskIds: [] }, "related-tasks-mode-conflict"],
    [{ relatedTaskIds: [], removeRelatedTaskIds: [] }, "related-tasks-mode-conflict"],
    [{ addRelatedTaskIds: [" t3 "], removeRelatedTaskIds: ["t3"] }, "related-tasks-operation-conflict"],
    [{ addRelatedTaskIds: "t3" }, "related-tasks-invalid"],
    [{ removeRelatedTaskIds: null }, "related-tasks-invalid"],
    [{ addRelatedTaskIds: [7] }, "related-tasks-invalid"],
    [{ removeRelatedTaskIds: [" "] }, "related-tasks-invalid"],
    [{ addRelatedTaskIds: ["t2"] }, "related-tasks-invalid"],
    [{ removeRelatedTaskIds: ["t2"] }, "related-tasks-invalid"],
  ])("rejects ambiguous or invalid operations before writing: %j", async (payload, error) => {
    const response = await patch(payload);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.taskRelation.deleteMany).not.toHaveBeenCalled();
    expect(db.taskRelation.createMany).not.toHaveBeenCalled();
  });

  test("invalid additions prevent removals and other metadata writes", async () => {
    db.task.findMany.mockResolvedValue([]);
    const response = await patch({ title: "Do not save", addRelatedTaskIds: ["foreign"], removeRelatedTaskIds: ["t1"] });
    expect(response.status).toBe(400);
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.taskRelation.deleteMany).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...agentAccess, scopes: ["task:read"] }, 403],
    [{ ...agentAccess, projectId: "p2" }, 404],
  ])("enforces agent scopes and project before database access", async (access, status) => {
    auth.getAgentProjectAccessContext.mockReturnValue(access);
    expect((await patch({ removeRelatedTaskIds: ["t1"] })).status).toBe(status);
    expect(db.project.findFirst).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
  });

  test("viewers cannot add or remove pairs", async () => {
    db.project.findFirst.mockResolvedValue({ ownerId: "another", memberships: [{ role: "viewer" }] });
    expect((await patch({ addRelatedTaskIds: ["t3"] })).status).toBe(403);
    expect(db.task.update).not.toHaveBeenCalled();
  });
});
