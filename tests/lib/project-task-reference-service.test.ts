import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), access: vi.fn(), findFirst: vi.fn(), transaction: vi.fn(), log: vi.fn(),
}));
vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: mocks.scope, requireProjectRole: mocks.access,
}));
vi.mock("@/lib/services/rls-context", () => ({ withActorRlsContext: mocks.transaction }));
vi.mock("@/lib/observability/logger", () => ({ logServerError: mocks.log }));
import { resolveProjectTaskReference } from "@/lib/services/project-task-reference-service";

const input = { actorUserId: "reader", projectId: "project-a", reference: "ND-1", namespace: "current" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockReturnValue({ ok: true });
  mocks.access.mockResolvedValue({ ok: true });
  mocks.transaction.mockImplementation((_actor, operation) => operation({ task: { findFirst: mocks.findFirst } }));
  mocks.findFirst.mockResolvedValue({ id: "stable-id", referenceNumber: 1, legacyReferenceNumber: 536 });
});

test.each(["current", "legacy"])("resolves %s references with mandatory project context and no namespace fallback", async (namespace) => {
  const result = await resolveProjectTaskReference({ ...input, namespace });
  expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({
    where: { projectId: "project-a", [namespace === "legacy" ? "legacyReferenceNumber" : "referenceNumber"]: 1 },
    select: { id: true, referenceNumber: true, legacyReferenceNumber: true },
  });
  expect(result).toEqual({ ok: true, data: {
    id: "stable-id", projectId: "project-a", reference: "ND-1", legacyReference: "ND-536",
    url: "/projects/project-a?taskId=stable-id",
  } });
  expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-a", minimumRole: "viewer" }));
});

test("the same reference in a second project returns that project's internal identity", async () => {
  mocks.findFirst.mockImplementation(({ where }) => Promise.resolve({
    id: where.projectId, referenceNumber: 1, legacyReferenceNumber: null,
  }));
  const a = await resolveProjectTaskReference(input);
  const b = await resolveProjectTaskReference({ ...input, projectId: "project-b" });
  expect(a.ok && a.data.id).toBe("project-a");
  expect(b.ok && b.data.id).toBe("project-b");
  expect(b.ok && b.data.legacyReference).toBeNull();
});

test.each(["ND-0", "ND--1", "ND-01", "ND-1.5", "ND-1e2", "1", "", "ND-2147483648", "ND-9007199254740992"])("rejects malformed or out-of-range reference %s", async (reference) => {
  expect(await resolveProjectTaskReference({ ...input, reference })).toMatchObject({ ok: false, status: 400 });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

test("normalizes case and whitespace and includes archived tasks", async () => {
  await resolveProjectTaskReference({ ...input, reference: " nd-42 " });
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-a", referenceNumber: 42 } }));
});

test("does not fall back to current numbering for missing legacy references", async () => {
  mocks.findFirst.mockResolvedValue(null);
  expect(await resolveProjectTaskReference({ ...input, namespace: "legacy" })).toMatchObject({ ok: false, status: 404 });
  expect(mocks.findFirst).toHaveBeenCalledTimes(1);
});

test("denies wrong project/scopes before reading", async () => {
  mocks.scope.mockReturnValue({ ok: false, status: 403, error: "forbidden" });
  expect(await resolveProjectTaskReference(input)).toMatchObject({ ok: false, status: 403 });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

test("denies missing membership before querying tasks", async () => {
  mocks.access.mockResolvedValue({ ok: false, status: 404, error: "not-found" });
  expect(await resolveProjectTaskReference(input)).toMatchObject({ ok: false, status: 404 });
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

test("rejects unknown namespaces, missing actors and project context", async () => {
  expect(await resolveProjectTaskReference({ ...input, namespace: "guess" })).toMatchObject({ status: 400 });
  expect(await resolveProjectTaskReference({ ...input, actorUserId: " " })).toMatchObject({ status: 401 });
  expect(await resolveProjectTaskReference({ ...input, projectId: " " })).toMatchObject({ status: 400 });
});

test("maps database failure without leaking details", async () => {
  mocks.findFirst.mockRejectedValue(new Error("database details"));
  expect(await resolveProjectTaskReference(input)).toEqual({ ok: false, status: 500, error: "task-reference-lookup-failed" });
});
