import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAuthenticatedApiUser: vi.fn(), updateProjectAgentCredentialDescriptiveLabels: vi.fn() }));
vi.mock("@/lib/auth/api-guard", () => ({ requireAuthenticatedApiUser: mocks.requireAuthenticatedApiUser }));
vi.mock("@/lib/services/project-agent-access-service", () => ({ updateProjectAgentCredentialDescriptiveLabels: mocks.updateProjectAgentCredentialDescriptiveLabels }));
import { PATCH } from "@/app/api/projects/[projectId]/agent-access/[credentialId]/labels/route";
const params = Promise.resolve({ projectId: "p", credentialId: "c" });
const request = (body: string) => new Request("http://localhost/api/projects/p/agent-access/c/labels", { method: "PATCH", body });
beforeEach(() => { vi.clearAllMocks(); mocks.requireAuthenticatedApiUser.mockResolvedValue({ ok: true, userId: "owner" }); });

test("passes descriptive metadata to the owner service and returns only its projection", async () => {
  const data = { credential: { id: "c", descriptiveLabels: ["GPT-6"] } };
  mocks.updateProjectAgentCredentialDescriptiveLabels.mockResolvedValue({ ok: true, status: 200, data });
  const response = await PATCH(request(JSON.stringify({ descriptiveLabels: ["GPT-6"], scopes: ["task:delete"] })) as never, { params });
  expect(await response.json()).toEqual(data);
  expect(mocks.updateProjectAgentCredentialDescriptiveLabels).toHaveBeenCalledWith({ actorUserId: "owner", projectId: "p", credentialId: "c", descriptiveLabels: ["GPT-6"] });
});
test.each(["{", "null", "{}", "[]"])("rejects malformed payload %s", async (body) => {
  expect((await PATCH(request(body) as never, { params })).status).toBe(400);
  expect(mocks.updateProjectAgentCredentialDescriptiveLabels).not.toHaveBeenCalled();
});
test("rejects signed-out and bearer-only access through the human-session guard", async () => {
  mocks.requireAuthenticatedApiUser.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await PATCH(request('{"descriptiveLabels":[]}') as never, { params })).status).toBe(401);
  expect(mocks.updateProjectAgentCredentialDescriptiveLabels).not.toHaveBeenCalled();
});
test("maps service authorization and validation errors", async () => {
  mocks.updateProjectAgentCredentialDescriptiveLabels.mockResolvedValue({ ok: false, status: 403, error: "forbidden" });
  const response = await PATCH(request('{"descriptiveLabels":[]}') as never, { params });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
});
