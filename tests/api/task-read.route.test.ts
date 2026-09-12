import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  getAgentProjectAccessContext: vi.fn(),
  requireApiPrincipal: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  getProjectKanbanTaskById: vi.fn(),
}));

const projectActorServiceMock = vi.hoisted(() => ({
  loadProjectActorRegistryForActor: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
}));

vi.mock("@/lib/services/project-actor-service", () => ({
  loadProjectActorRegistryForActor:
    projectActorServiceMock.loadProjectActorRegistryForActor,
}));

vi.mock("@/lib/services/project-service", () => ({
  getProjectKanbanTaskById: projectServiceMock.getProjectKanbanTaskById,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/services/project-attachment-service", () => ({
  mapTaskAttachmentResponse: vi.fn(
    (
      projectId: string,
      taskId: string,
      attachment: Record<string, unknown>
    ) => ({
      ...attachment,
      downloadUrl:
        attachment.kind === "file"
          ? `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/download`
          : null,
    })
  ),
}));

import { GET } from "@/app/api/projects/[projectId]/tasks/[taskId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function taskRouteParams(projectId: string, taskId: string) {
  return { params: Promise.resolve({ projectId, taskId }) };
}

function taskReadRequest(projectId = "p1", taskId = "task-9") {
  return new NextRequest(
    `http://localhost/api/projects/${projectId}/tasks/${taskId}`
  );
}

function buildTaskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-9",
    referenceNumber: 42,
    title: "Read task",
    description: null,
    blockedNote: null,
    deadlineAt: null,
    _count: { comments: 0 },
    completedAt: null,
    archivedAt: null,
    status: "Backlog",
    position: 0,
    label: null,
    labelsJson: null,
    createdAt: new Date("2026-07-30T08:00:00.000Z"),
    updatedAt: new Date("2026-07-30T08:00:00.000Z"),
    epic: null,
    assigneeUser: null,
    createdByUser: null,
    updatedByUser: null,
    attachments: [],
    outgoingRelations: [],
    incomingRelations: [],
    blockedFollowUps: [],
    ...overrides,
  };
}

function mockHumanPrincipal() {
  apiGuardMock.requireApiPrincipal.mockResolvedValue({
    ok: true,
    principal: {
      kind: "human",
      actorUserId: "test-user",
      requestId: "request-1",
    },
  });
  apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
}

describe("GET /api/projects/:projectId/tasks/:taskId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHumanPrincipal();
    projectActorServiceMock.loadProjectActorRegistryForActor.mockResolvedValue(
      null
    );
  });

  test("rejects the request when authentication fails", async () => {
    const unauthorizedResponse = NextResponse.json(
      { error: "unauthorized" },
      { status: 401 }
    );
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: false,
      response: unauthorizedResponse,
    });

    const response = await GET(
      taskReadRequest(),
      taskRouteParams("p1", "task-9")
    );

    expect(response).toBe(unauthorizedResponse);
    expect(projectServiceMock.getProjectKanbanTaskById).not.toHaveBeenCalled();
  });

  test("returns 400 when route parameters are missing", async () => {
    for (const params of [
      taskRouteParams("", "task-9"),
      taskRouteParams("p1", ""),
    ]) {
      const response = await GET(taskReadRequest(), params);

      expect(response.status).toBe(400);
      await expect(readJson(response)).resolves.toEqual({
        error: "Missing route parameters",
      });
    }
    expect(projectServiceMock.getProjectKanbanTaskById).not.toHaveBeenCalled();
  });

  test("returns the canonical task payload wrapped in a task object", async () => {
    const record = buildTaskRecord({
      attachments: [
        {
          id: "att-1",
          kind: "file",
          name: "brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          url: "https://example.com/brief.pdf",
        },
      ],
    });
    projectServiceMock.getProjectKanbanTaskById.mockResolvedValueOnce({
      ok: true,
      data: { task: record },
    });

    const response = await GET(
      taskReadRequest(),
      taskRouteParams("p1", "task-9")
    );

    expect(response.status).toBe(200);
    expect(projectServiceMock.getProjectKanbanTaskById).toHaveBeenCalledWith(
      "p1",
      "task-9",
      "test-user",
      undefined
    );
    const payload = (await readJson(response)) as {
      task: Record<string, unknown>;
    };
    expect(payload.task).toMatchObject({
      id: "task-9",
      reference: "ND-42",
      title: "Read task",
      status: "Backlog",
      commentCount: 0,
      labels: [],
      label: null,
      labelsJson: null,
      deadlineDate: null,
      archivedAt: null,
      createdAt: "2026-07-30T08:00:00.000Z",
      updatedAt: "2026-07-30T08:00:00.000Z",
      relatedTasks: [],
      blockedFollowUps: [],
      attachments: [
        {
          id: "att-1",
          kind: "file",
          name: "brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          url: "https://example.com/brief.pdf",
          downloadUrl:
            "/api/projects/p1/tasks/task-9/attachments/att-1/download",
        },
      ],
    });
    expect(payload.task.createdBy).toEqual({
      kind: "user",
      owner: null,
      agentCredentialId: null,
      agentCredentialLabel: null,
    });
    expect(payload.task.updatedBy).toEqual({
      kind: "user",
      owner: null,
      agentCredentialId: null,
      agentCredentialLabel: null,
    });
    expect(payload.task.epic).toBeNull();
    expect(payload.task.assignee).toBeNull();
  });

  test("forwards the agent access context to the service", async () => {
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "owner-1",
        ownerUserId: "owner-1",
        credentialId: "credential-1",
        projectId: "p1",
        scopes: ["task:read"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue({
      credentialId: "credential-1",
      projectId: "p1",
      scopes: ["task:read"],
    });
    projectServiceMock.getProjectKanbanTaskById.mockResolvedValueOnce({
      ok: true,
      data: { task: buildTaskRecord() },
    });

    const response = await GET(
      taskReadRequest(),
      taskRouteParams("p1", "task-9")
    );

    expect(response.status).toBe(200);
    expect(projectServiceMock.getProjectKanbanTaskById).toHaveBeenCalledWith(
      "p1",
      "task-9",
      "owner-1",
      {
        credentialId: "credential-1",
        projectId: "p1",
        scopes: ["task:read"],
      }
    );
  });

  test("passes through service errors with their status and error string", async () => {
    for (const failure of [
      { ok: false, status: 403, error: "forbidden" },
      { ok: false, status: 404, error: "Task not found" },
    ]) {
      projectServiceMock.getProjectKanbanTaskById.mockResolvedValueOnce(
        failure
      );

      const response = await GET(
        taskReadRequest(),
        taskRouteParams("p1", "task-9")
      );

      expect(response.status).toBe(failure.status);
      await expect(readJson(response)).resolves.toEqual({
        error: failure.error,
      });
    }
    expect(projectServiceMock.getProjectKanbanTaskById).toHaveBeenCalledTimes(
      2
    );
  });
});
