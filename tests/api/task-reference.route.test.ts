import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ principal: vi.fn(), agent: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/auth/api-guard", () => ({ requireApiPrincipal: mocks.principal, getAgentProjectAccessContext: mocks.agent }));
vi.mock("@/lib/services/project-task-reference-service", () => ({ resolveProjectTaskReference: mocks.resolve }));
import { GET } from "@/app/api/projects/[projectId]/tasks/reference/route";
const props = { params: Promise.resolve({ projectId: "project-1" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.principal.mockResolvedValue({ ok: true, principal: { actorUserId: "user-1" } });
  mocks.agent.mockReturnValue({ projectId: "project-1", credentialId: "agent-1" });
  mocks.resolve.mockResolvedValue({ ok: true, data: { id: "stable-id", reference: "ND-1" } });
});
test.each([undefined, "legacy"])("passes namespace %s and authenticated scope to the service", async (namespace) => {
  const response = await GET(new NextRequest(`http://localhost/api/projects/project-1/tasks/reference?reference=ND-536${namespace ? `&namespace=${namespace}` : ""}`), props);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: "stable-id", reference: "ND-1" });
  expect(mocks.resolve).toHaveBeenCalledWith({ actorUserId: "user-1", projectId: "project-1", reference: "ND-536", namespace: namespace ?? "current", agentAccess: { projectId: "project-1", credentialId: "agent-1" } });
});
test("returns service errors and preserves empty invalid input", async () => {
  mocks.resolve.mockResolvedValue({ ok: false, status: 400, error: "invalid-reference" });
  const response = await GET(new NextRequest("http://localhost/api/projects/project-1/tasks/reference?namespace="), props);
  expect(response.status).toBe(400);
  expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ reference: "", namespace: "" }));
});
test("rejects unauthenticated reads before resolution", async () => {
  mocks.principal.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
  expect((await GET(new NextRequest("http://localhost/api/projects/project-1/tasks/reference"), props)).status).toBe(401);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
