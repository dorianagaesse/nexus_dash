import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { encodeAgentAttentionCursor } from "@/lib/agent-attention";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const attentionServiceMock = vi.hoisted(() => ({
  listAgentMentionEvents: vi.fn(),
  listAgentAssignments: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-agent-attention-service", () => ({
  listAgentMentionEvents: attentionServiceMock.listAgentMentionEvents,
  listAgentAssignments: attentionServiceMock.listAgentAssignments,
  mapAgentMentionItemToResponse: (item: { occurredAt: Date | null }) => ({
    ...item,
    occurredAt: item.occurredAt ? item.occurredAt.toISOString() : null,
  }),
  mapAgentAssignmentItemToResponse: (item: { occurredAt: Date | null }) => ({
    ...item,
    occurredAt: item.occurredAt ? item.occurredAt.toISOString() : null,
  }),
}));

import { GET as getMentionEvents } from "@/app/api/projects/[projectId]/agent-attention/mentions/route";
import { GET as getAssignments } from "@/app/api/projects/[projectId]/agent-attention/assignments/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

const AGENT_ACCESS = {
  credentialId: "credential-1",
  projectId: "p1",
  scopes: ["attention:read"],
};

const MENTION_ITEM = {
  id: "mention:row-1",
  eventType: "mention" as const,
  projectId: "p1",
  occurredAt: new Date("2026-09-12T10:00:00.000Z"),
  artifact: {
    type: "task_comment" as const,
    id: "comment-1",
    taskId: "task-1",
    taskTitle: "Release task",
  },
  summary: "reviewer mentioned Release bot (agent) in a comment",
  actor: {
    kind: "human" as const,
    id: "user-1",
    displayName: "reviewer",
    usernameTag: "reviewer#0007",
  },
  currentState: { status: "Todo", archivedAt: null },
};

function mentionResponseItem() {
  return {
    ...MENTION_ITEM,
    occurredAt: "2026-09-12T10:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGuardMock.requireApiPrincipal.mockResolvedValue({
    ok: true,
    principal: {
      kind: "agent",
      actorUserId: "owner-1",
      requestId: "request-agent-1",
    },
  });
  apiGuardMock.getAgentProjectAccessContext.mockReturnValue(AGENT_ACCESS);
  attentionServiceMock.listAgentMentionEvents.mockResolvedValue({
    ok: true,
    data: { items: [], nextCursor: null },
  });
  attentionServiceMock.listAgentAssignments.mockResolvedValue({
    ok: true,
    data: { items: [], nextCursor: null },
  });
});

describe("GET /api/projects/:projectId/agent-attention/mentions", () => {
  test("rejects human principals", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(undefined);

    const response = await getMentionEvents(
      new NextRequest("http://localhost/api/projects/p1/agent-attention/mentions"),
      projectParams("p1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: "forbidden" });
    expect(attentionServiceMock.listAgentMentionEvents).not.toHaveBeenCalled();
  });

  test("passes through authentication failures", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await getMentionEvents(
      new NextRequest("http://localhost/api/projects/p1/agent-attention/mentions"),
      projectParams("p1")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
  });

  test("rejects filters outside the mention surface", async () => {
    const response = await getMentionEvents(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/mentions?eventType=assignment"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-attention-invalid-filter",
    });
    expect(attentionServiceMock.listAgentMentionEvents).not.toHaveBeenCalled();
  });

  test("rejects invalid cursors", async () => {
    const response = await getMentionEvents(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/mentions?cursor=garbage"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-attention-invalid-cursor",
    });
  });

  test("lists mention events with the parsed filter envelope", async () => {
    attentionServiceMock.listAgentMentionEvents.mockResolvedValueOnce({
      ok: true,
      data: { items: [MENTION_ITEM], nextCursor: "next-cursor" },
    });

    const response = await getMentionEvents(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/mentions?limit=5&order=asc&since=2026-09-01T00:00:00.000Z"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      projectId: "p1",
      filters: {
        eventType: null,
        artifactType: null,
        state: null,
        since: "2026-09-01T00:00:00.000Z",
        until: null,
        limit: 5,
        order: "asc",
        cursor: null,
      },
      items: [mentionResponseItem()],
      nextCursor: "next-cursor",
    });
    expect(attentionServiceMock.listAgentMentionEvents).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "p1",
      agentAccess: AGENT_ACCESS,
      filters: {
        eventType: null,
        artifactType: null,
        state: null,
        since: new Date("2026-09-01T00:00:00.000Z"),
        until: null,
        limit: 5,
        order: "asc",
        cursor: null,
      },
    });
  });

  test("echoes a valid cursor and forwards the decoded value", async () => {
    const cursor = encodeAgentAttentionCursor({
      order: "desc",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      id: "row-2",
    });

    const response = await getMentionEvents(
      new NextRequest(
        `http://localhost/api/projects/p1/agent-attention/mentions?cursor=${encodeURIComponent(cursor)}`
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.filters).toMatchObject({ cursor });
    expect(attentionServiceMock.listAgentMentionEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          cursor: {
            order: "desc",
            occurredAt: new Date("2026-09-12T10:00:00.000Z"),
            id: "row-2",
          },
        }),
      })
    );
  });

  test("ignores credential parameters in favor of the authenticated credential", async () => {
    await getMentionEvents(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/mentions?credentialId=credential-other"
      ),
      projectParams("p1")
    );

    expect(attentionServiceMock.listAgentMentionEvents).toHaveBeenCalledWith(
      expect.objectContaining({ agentAccess: AGENT_ACCESS })
    );
  });

  test("maps service failures to their status", async () => {
    attentionServiceMock.listAgentMentionEvents.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "agent-attention-list-failed",
    });

    const response = await getMentionEvents(
      new NextRequest("http://localhost/api/projects/p1/agent-attention/mentions"),
      projectParams("p1")
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-attention-list-failed",
    });
  });
});

describe("GET /api/projects/:projectId/agent-attention/assignments", () => {
  test("rejects human principals", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(undefined);

    const response = await getAssignments(
      new NextRequest("http://localhost/api/projects/p1/agent-attention/assignments"),
      projectParams("p1")
    );

    expect(response.status).toBe(403);
    expect(attentionServiceMock.listAgentAssignments).not.toHaveBeenCalled();
  });

  test("rejects state values outside the surface", async () => {
    const response = await getAssignments(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/assignments?state=pending"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "agent-attention-invalid-filter",
    });
    expect(attentionServiceMock.listAgentAssignments).not.toHaveBeenCalled();
  });

  test("forwards the parsed assignment filters", async () => {
    const response = await getAssignments(
      new NextRequest(
        "http://localhost/api/projects/p1/agent-attention/assignments?eventType=assignment&artifactType=meeting_todo&state=active&until=2026-09-13T00:00:00.000Z"
      ),
      projectParams("p1")
    );

    expect(response.status).toBe(200);
    expect(attentionServiceMock.listAgentAssignments).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      projectId: "p1",
      agentAccess: AGENT_ACCESS,
      filters: {
        eventType: "assignment",
        artifactType: "meeting_todo",
        state: "active",
        since: null,
        until: new Date("2026-09-13T00:00:00.000Z"),
        limit: 50,
        order: "desc",
        cursor: null,
      },
    });
  });
});
