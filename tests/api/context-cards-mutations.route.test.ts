import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const contextCardServiceMock = vi.hoisted(() => ({
  createContextCardForProject: vi.fn(),
  updateContextCardForProject: vi.fn(),
  deleteContextCardForProject: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/context-card-service", () => ({
  createContextCardForProject: contextCardServiceMock.createContextCardForProject,
  updateContextCardForProject: contextCardServiceMock.updateContextCardForProject,
  deleteContextCardForProject: contextCardServiceMock.deleteContextCardForProject,
}));

import { POST } from "@/app/api/projects/[projectId]/context-cards/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/projects/[projectId]/context-cards/[cardId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("context cards mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "test-user",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
  });

  test("POST creates context card from form payload", async () => {
    contextCardServiceMock.createContextCardForProject.mockResolvedValueOnce({
      ok: true,
      data: { id: "card-1" },
    });

    const formData = new FormData();
    formData.set("title", "  Sprint notes  ");
    formData.set("content", "  <p>Context body</p>  ");
    formData.set("color", "  #abc  ");
    formData.set("attachmentLinks", '[{"name":"","url":"https://example.com"}]');
    formData.append(
      "attachmentFiles",
      new File(["body"], "card.txt", { type: "text/plain" })
    );

    const request = new Request("http://localhost/api/projects/p1/context-cards", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({ cardId: "card-1" });
    expect(contextCardServiceMock.createContextCardForProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      title: "Sprint notes",
      content: "<p>Context body</p>",
      color: "#abc",
      attachmentLinksJsonRaw: '[{"name":"","url":"https://example.com"}]',
      attachmentFiles: expect.any(Array),
      agentAccess: undefined,
    });
  });

  test("PATCH updates context card via service", async () => {
    contextCardServiceMock.updateContextCardForProject.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const formData = new FormData();
    formData.set("title", "  Updated title  ");
    formData.set("content", "  <p>Updated content</p>  ");
    formData.set("color", "  #def  ");

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/c1",
      {
        method: "PATCH",
        body: formData,
      }
    );

    const response = await PATCH(request as never, {
      params: { projectId: "p1", cardId: "c1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(contextCardServiceMock.updateContextCardForProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      cardId: "c1",
      title: "Updated title",
      content: "<p>Updated content</p>",
      color: "#def",
      agentAccess: undefined,
    });
  });

  test("DELETE removes context card via service", async () => {
    contextCardServiceMock.deleteContextCardForProject.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const request = new Request(
      "http://localhost/api/projects/p1/context-cards/c1",
      {
        method: "DELETE",
      }
    );

    const response = await DELETE(request as never, {
      params: { projectId: "p1", cardId: "c1" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(contextCardServiceMock.deleteContextCardForProject).toHaveBeenCalledWith({
      actorUserId: "test-user",
      projectId: "p1",
      cardId: "c1",
      agentAccess: undefined,
    });
  });

  test("rejects file attachments for agent callers", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "p1",
        scopes: ["context:write"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce({
      credentialId: "credential-1",
      projectId: "p1",
      scopes: ["context:write"],
    });

    const formData = new FormData();
    formData.set("title", "Agent Context");
    formData.append(
      "attachmentFiles",
      new File(["body"], "card.txt", { type: "text/plain" })
    );

    const request = new Request("http://localhost/api/projects/p1/context-cards", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as never, {
      params: { projectId: "p1" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-file-attachments-not-supported",
    });
    expect(contextCardServiceMock.createContextCardForProject).not.toHaveBeenCalled();
  });
});
