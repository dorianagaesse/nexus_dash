import { beforeEach, describe, expect, test, vi } from "vitest";

const contextCardServiceMock = vi.hoisted(() => ({
  createContextCardForProject: vi.fn(),
  updateContextCardForProject: vi.fn(),
  deleteContextCardForProject: vi.fn(),
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
  });

  test("POST creates context card from form payload", async () => {
    contextCardServiceMock.createContextCardForProject.mockResolvedValueOnce({
      ok: true,
      data: { id: "card-1" },
    });

    const formData = new FormData();
    formData.set("title", "  Sprint notes  ");
    formData.set("content", "  Context body  ");
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
      projectId: "p1",
      title: "Sprint notes",
      content: "Context body",
      color: "#abc",
      attachmentLinksJsonRaw: '[{"name":"","url":"https://example.com"}]',
      attachmentFiles: expect.any(Array),
    });
  });

  test("PATCH updates context card via service", async () => {
    contextCardServiceMock.updateContextCardForProject.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const formData = new FormData();
    formData.set("title", "  Updated title  ");
    formData.set("content", "  Updated content  ");
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
      projectId: "p1",
      cardId: "c1",
      title: "Updated title",
      content: "Updated content",
      color: "#def",
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
      projectId: "p1",
      cardId: "c1",
    });
  });
});
