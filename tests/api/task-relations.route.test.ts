import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
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

function patch(payload: unknown, etag?: string) {
  return PATCH(
    new Request("http://localhost/api/projects/p1/tasks/t2", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(etag ? { "X-Content-If-Match": etag } : {}) },
      body: JSON.stringify(payload),
    }) as never,
    { params: Promise.resolve({ projectId: "p1", taskId: "t2" }) }
  );
}

describe("additive task relation PATCH", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$queryRaw.mockResolvedValue([{ contentRevision: 1 }]);
    db.$transaction.mockImplementation(async (operation) => operation(db));
    auth.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: { kind: "agent", actorUserId: "owner", ...agentAccess },
    });
    auth.getAgentProjectAccessContext.mockReturnValue(agentAccess);
    db.project.findFirst.mockResolvedValue({ ownerId: "owner", memberships: [] });
    db.apiCredential.findFirst.mockResolvedValue({ id: "codex", label: "Codex" });
    db.task.findMany.mockResolvedValue([{ id: "t3" }]);
    db.task.findUnique.mockResolvedValue({
      id: "t2", projectId: "p1", referenceNumber: 2, contentRevision: 1,
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

  test("replacement retains unchanged incoming and archived pairs", async () => {
    db.task.findMany.mockResolvedValue([{ id: "t1" }, { id: "t4" }]);
    const response = await patch({ relatedTaskIds: ["t1", "t4", "t1"] }, '"task:t2:1"');
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"task:t2:1"');
    expect(db.taskRelation.deleteMany).not.toHaveBeenCalled();
    expect(db.taskRelation.createMany).not.toHaveBeenCalled();
  });

  test("replacement mutates only added and removed pairs", async () => {
    db.task.findMany.mockResolvedValue([{ id: "t4" }, { id: "t3" }]);
    expect((await patch({ relatedTaskIds: ["t4", "t3"] })).status).toBe(200);
    expect(db.taskRelation.deleteMany).toHaveBeenCalledWith({ where: {
      projectId: "p1", OR: [{ leftTaskId: "t1", rightTaskId: "t2" }],
    } });
    expect(db.taskRelation.createMany).toHaveBeenCalledWith({
      data: [{ projectId: "p1", leftTaskId: "t2", rightTaskId: "t3" }], skipDuplicates: true,
    });
  });

  test("a guarded deadlock retries authorization and rejects the newly stale revision", async () => {
    db.taskRelation.createMany.mockRejectedValueOnce({ code: "P2034" });
    db.$queryRaw.mockResolvedValueOnce([{ contentRevision: 1 }])
      .mockResolvedValueOnce([{ contentRevision: 2 }]);
    const response = await patch({ addRelatedTaskIds: ["t3"] }, '"task:t2:1"');
    expect(response.status).toBe(412);
    expect((await response.json()).error).toBe("edit-conflict");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.project.findFirst).toHaveBeenCalledTimes(2);
    expect(db.task.update).toHaveBeenCalledTimes(1);
    expect(db.taskRelation.createMany).toHaveBeenCalledTimes(1);
  });

  test("guarded deadlock retries are bounded", async () => {
    db.taskRelation.createMany.mockRejectedValue({ code: "P2034" });
    expect((await patch({ addRelatedTaskIds: ["t3"] }, '"task:t2:1"')).status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  test.each([
    [{ relatedTaskIds: [], addRelatedTaskIds: [] }, "related-tasks-mode-conflict"],
    [{ relatedTaskIds: [], removeRelatedTaskIds: [] }, "related-tasks-mode-conflict"],
    [{ addRelatedTaskIds: [" t3 "], removeRelatedTaskIds: ["t3"] }, "related-tasks-operation-conflict"],
    [{ addRelatedTaskIds: "t3" }, "related-tasks-invalid"],
    [{ removeRelatedTaskIds: null }, "related-tasks-invalid"],
    [{ addRelatedTaskIds: [7] }, "related-tasks-invalid"],
    [{ removeRelatedTaskIds: [" "] }, "related-tasks-invalid"],
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
    { id: "archived", candidate: { id: "archived", projectId: "p1", archivedAt: new Date() }, reason: "archived" },
    { id: "foreign", candidate: null, reason: "missing" },
    { id: "missing", candidate: null, reason: "missing" },
  ])("names the first invalid relation target and reason: $reason", async ({ id, candidate, reason }) => {
    db.task.findMany.mockResolvedValueOnce([{ id: "t3" }]).mockResolvedValueOnce(candidate ? [candidate] : []);
    const response = await patch({ title: "Do not save", addRelatedTaskIds: ["t3", id] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "related-tasks-invalid",
      invalidRelatedTask: { id, reason },
    });
    expect(db.task.findMany).toHaveBeenNthCalledWith(2, {
      where: { id, projectId: "p1" },
      select: { id: true, projectId: true, archivedAt: true },
    });
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.taskRelation.createMany).not.toHaveBeenCalled();
  });

  test("identifies a cross-project target already visible to a human caller", async () => {
    auth.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: { kind: "human", actorUserId: "owner" },
    });
    auth.getAgentProjectAccessContext.mockReturnValue(undefined);
    db.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "foreign", projectId: "p2", archivedAt: null },
    ]);
    const response = await patch({ relatedTaskIds: ["foreign"] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "related-tasks-invalid",
      invalidRelatedTask: { id: "foreign", reason: "cross-project" },
    });
    expect(db.task.findMany).toHaveBeenNthCalledWith(2, {
      where: { id: "foreign" },
      select: { id: true, projectId: true, archivedAt: true },
    });
  });

  test.each([{ addRelatedTaskIds: ["t2"] }, { removeRelatedTaskIds: ["t2"] }])(
    "identifies a self relation without querying target tasks: %j",
    async (payload) => {
      const response = await patch(payload);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "related-tasks-invalid",
        invalidRelatedTask: { id: "t2", reason: "self" },
      });
      expect(db.task.findMany).not.toHaveBeenCalled();
    }
  );

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
