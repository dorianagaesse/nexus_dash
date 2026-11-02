import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
  requireApiPrincipal: vi.fn(),
  getAgentProjectAccessContext: vi.fn(),
}));

const meetingNoteServiceMock = vi.hoisted(() => ({
  listProjectMeetingNotes: vi.fn(),
  createProjectMeetingNote: vi.fn(),
  updateProjectMeetingNote: vi.fn(),
  setProjectMeetingNoteActionCompletion: vi.fn(),
  setProjectMeetingNoteActionAssignee: vi.fn(),
  deleteProjectMeetingNote: vi.fn(),
}));

const activityEventResponseMock = vi.hoisted(() => ({
  recordProjectActivityEventVersion: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
}));

vi.mock("@/lib/services/project-meeting-note-service", () => ({
  listProjectMeetingNotes: meetingNoteServiceMock.listProjectMeetingNotes,
  createProjectMeetingNote: meetingNoteServiceMock.createProjectMeetingNote,
  updateProjectMeetingNote: meetingNoteServiceMock.updateProjectMeetingNote,
  setProjectMeetingNoteActionCompletion:
    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion,
  setProjectMeetingNoteActionAssignee:
    meetingNoteServiceMock.setProjectMeetingNoteActionAssignee,
  deleteProjectMeetingNote: meetingNoteServiceMock.deleteProjectMeetingNote,
}));

vi.mock("@/lib/project-activity-event-response", () => ({
  recordProjectActivityEventVersion:
    activityEventResponseMock.recordProjectActivityEventVersion,
}));

import {
  GET as listMeetingNotes,
  POST as createMeetingNote,
} from "@/app/api/projects/[projectId]/meeting-notes/route";
import {
  DELETE as deleteMeetingNote,
  PATCH as updateMeetingNote,
} from "@/app/api/projects/[projectId]/meeting-notes/[noteId]/route";
import { PATCH as updateMeetingTodo } from "@/app/api/projects/[projectId]/meeting-notes/[noteId]/actions/[actionId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function noteParams(projectId: string, noteId: string) {
  return { params: Promise.resolve({ projectId, noteId }) };
}

function actionParams(projectId: string, noteId: string, actionId: string) {
  return { params: Promise.resolve({ projectId, noteId, actionId }) };
}

function sampleNote() {
  return {
    id: "note-1",
    projectId: "project-1",
    title: "Weekly execution review",
    scheduledAt: new Date("2026-06-08T14:00:00.000Z"),
    participants: [
      {
        userId: "user-2",
        displayName: "Dorian",
        usernameTag: "dorian#0001",
        avatarSeed: "seed-dorian",
      },
      {
        userId: null,
        displayName: "Camille",
        usernameTag: null,
        avatarSeed: null,
      },
    ],
    labels: ["planning"],
    status: "actions_in_progress",
    inputNotes: "Review roadmap risks.",
    outputNotes: "Scope was clarified.",
    decisions: "Keep TASK-098 focused.",
    steward: {
      kind: "human",
      id: "user-2",
      displayName: "Dorian",
      usernameTag: "dorian#0001",
      avatarSeed: "seed-dorian",
      status: "active",
      isAssignable: true,
    },
    createdBy: {
      kind: "human",
      id: "user-2",
      displayName: "Dorian",
      usernameTag: "dorian#0001",
      avatarSeed: "seed-dorian",
      status: "active",
      isAssignable: true,
    },
    updatedBy: {
      kind: "human",
      id: "user-2",
      displayName: "Dorian",
      usernameTag: "dorian#0001",
      avatarSeed: "seed-dorian",
      status: "active",
      isAssignable: true,
    },
    createdAt: new Date("2026-06-08T13:00:00.000Z"),
    updatedAt: new Date("2026-06-08T15:00:00.000Z"),
    actions: [
      {
        id: "action-1",
        content: "Send recap",
        completedAt: null,
        position: 0,
      },
    ],
  };
}

describe("project meeting notes routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
    apiGuardMock.requireApiPrincipal.mockResolvedValue({
      ok: true,
      principal: {
        kind: "human",
        actorUserId: "user-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValue(undefined);
    activityEventResponseMock.recordProjectActivityEventVersion.mockResolvedValue(
      new Date("2026-06-08T15:00:00.000Z")
    );
  });

  test("GET returns serialized meeting notes and forwards search query", async () => {
    meetingNoteServiceMock.listProjectMeetingNotes.mockResolvedValueOnce([sampleNote()]);

    const response = await listMeetingNotes(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes?q=recap"),
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toMatchObject({
      id: "note-1",
      steward: { id: "user-2" },
      createdBy: { id: "user-2" },
      updatedBy: { id: "user-2" },
    });
    expect(meetingNoteServiceMock.listProjectMeetingNotes).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "recap",
      stewardFilter: "all",
      agentAccess: undefined,
    });
  });

  test("GET forwards steward filter from query string", async () => {
    meetingNoteServiceMock.listProjectMeetingNotes.mockResolvedValueOnce([sampleNote()]);

    await listMeetingNotes(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes?steward=mine"
      ),
      projectParams("project-1")
    );

    expect(meetingNoteServiceMock.listProjectMeetingNotes).toHaveBeenCalledWith(
      expect.objectContaining({ stewardFilter: "mine" })
    );
  });

  test("POST creates a structured meeting note", async () => {
    meetingNoteServiceMock.createProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: {
        note: sampleNote(),
        activityVersion: new Date("2026-06-08T15:00:00.000Z"),
      },
    });

    const response = await createMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Weekly execution review",
          scheduledAt: "2026-06-08T14:00:00.000Z",
          participants: ["Dorian", "Camille"],
          labels: ["planning"],
          status: "actions_in_progress",
          inputNotes: "Review roadmap risks.",
          outputNotes: "Scope was clarified.",
          decisions: "Keep TASK-098 focused.",
          actions: [{ content: "Send recap" }],
        }),
      }),
      projectParams("project-1")
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-nexusdash-project-version")).toBe(
      "2026-06-08T15:00:00.000Z"
    );
    expect(meetingNoteServiceMock.createProjectMeetingNote).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Weekly execution review",
      scheduledAt: "2026-06-08T14:00:00.000Z",
      participants: [
        { userId: null, displayName: "Dorian" },
        { userId: null, displayName: "Camille" },
      ],
      labels: ["planning"],
      status: "actions_in_progress",
      inputNotes: "Review roadmap risks.",
      outputNotes: "Scope was clarified.",
      decisions: "Keep TASK-098 focused.",
      actions: [
        {
          id: null,
          content: "Send recap",
          completedAt: null,
        },
      ],
    });
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).not.toHaveBeenCalled();
  });

  test("PATCH updates a meeting note", async () => {
    meetingNoteServiceMock.updateProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: {
        note: sampleNote(),
        activityVersion: new Date("2026-06-08T15:00:00.000Z"),
      },
    });

    const response = await updateMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes/note-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Weekly execution review",
          participants: ["Dorian"],
          actions: [
            {
              id: "action-1",
              content: "Send recap",
              completedAt: "2026-06-08T15:00:00.000Z",
            },
          ],
        }),
      }),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(200);
    expect(meetingNoteServiceMock.updateProjectMeetingNote).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      title: "Weekly execution review",
      participants: [{ userId: null, displayName: "Dorian" }],
      actions: [
        {
          id: "action-1",
          content: "Send recap",
          completedAt: "2026-06-08T15:00:00.000Z",
        },
      ],
    });
  });

  test("DELETE removes a meeting note and records activity", async () => {
    meetingNoteServiceMock.deleteProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });

    const response = await deleteMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes/note-1", {
        method: "DELETE",
      }),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(meetingNoteServiceMock.deleteProjectMeetingNote).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
    });
    expect(activityEventResponseMock.recordProjectActivityEventVersion).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      domain: "meeting-note",
      action: "deleted",
      entityId: "note-1",
      payload: { noteId: "note-1" },
    });
  });

  test("PATCH updates one meeting todo completion state", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion.mockResolvedValueOnce({
      ok: true,
      data: {
        note: {
          ...sampleNote(),
          actions: [
            {
              ...sampleNote().actions[0],
              completedAt: new Date("2026-06-08T16:00:00.000Z"),
            },
          ],
        },
      },
    });

    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: true }),
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteActionCompletion
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: true,
    });
    expect(activityEventResponseMock.recordProjectActivityEventVersion).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      domain: "meeting-note",
      action: "updated",
      entityId: "note-1",
      payload: {
        noteId: "note-1",
        actionId: "action-1",
        actorCredentialId: null,
      },
    });
  });

  test("PATCH reopens one meeting todo completion state", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion.mockResolvedValueOnce({
      ok: true,
      data: {
        note: {
          ...sampleNote(),
          actions: [
            {
              ...sampleNote().actions[0],
              completedAt: null,
            },
          ],
        },
      },
    });

    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: false }),
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteActionCompletion
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        completed: false,
      })
    );
  });

  test("PATCH surfaces the service status when a todo completion fails", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: true }),
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({ error: "forbidden" });
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).not.toHaveBeenCalled();
  });

  test("PATCH rejects an invalid todo completion payload", async () => {
    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: "yes" }),
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "meeting-note-action-completed-invalid",
    });
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteActionCompletion
    ).not.toHaveBeenCalled();
  });

  test("GET forwards task-scoped agent identity to the service", async () => {
    const agentAccess = {
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:read" as const],
    };
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "user-1",
        ownerUserId: "user-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:read"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);
    meetingNoteServiceMock.listProjectMeetingNotes.mockResolvedValueOnce([]);

    const response = await listMeetingNotes(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes", {
        headers: { authorization: "Bearer token" },
      }),
      projectParams("project-1")
    );

    expect(response.status).toBe(200);
    expect(meetingNoteServiceMock.listProjectMeetingNotes).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      query: null,
      stewardFilter: "all",
      agentAccess,
    });
  });

  test("PATCH updates one meeting todo assignee", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteActionAssignee.mockResolvedValueOnce({
      ok: true,
      data: { note: sampleNote() },
    });
    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            assignee: { kind: "agent", id: "credential-1" },
          }),
          headers: { "content-type": "application/json" },
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteActionAssignee
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      assignee: { kind: "agent", id: "credential-1" },
      agentAccess: undefined,
    });
  });

  test("PATCH attributes agent completion through its credential context", async () => {
    const agentAccess = {
      credentialId: "credential-1",
      projectId: "project-1",
      scopes: ["task:write" as const],
    };
    apiGuardMock.requireApiPrincipal.mockResolvedValueOnce({
      ok: true,
      principal: {
        kind: "agent",
        actorUserId: "user-1",
        ownerUserId: "user-1",
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:write"],
        tokenId: "token-1",
        requestId: "request-1",
      },
    });
    apiGuardMock.getAgentProjectAccessContext.mockReturnValueOnce(agentAccess);
    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion.mockResolvedValueOnce({
      ok: true,
      data: { note: sampleNote() },
    });

    const response = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          body: JSON.stringify({ completed: true }),
          headers: {
            "content-type": "application/json",
            authorization: "Bearer token",
          },
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteActionCompletion
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: true,
      agentAccess,
    });
  });

  test("POST returns 400 for invalid json", async () => {
    const response = await createMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      projectParams("project-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(meetingNoteServiceMock.createProjectMeetingNote).not.toHaveBeenCalled();
  });

  test("POST and PATCH validate and forward visibility", async () => {
    const invalidCreateResponse = await createMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Weekly execution review",
          visibility: "secret",
        }),
      }),
      projectParams("project-1")
    );
    expect(invalidCreateResponse.status).toBe(400);
    await expect(readJson(invalidCreateResponse)).resolves.toEqual({
      error: "meeting-note-visibility-invalid",
    });

    meetingNoteServiceMock.createProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: {
        note: { ...sampleNote(), visibility: "private" },
        activityVersion: null,
      },
    });

    const validCreateResponse = await createMeetingNote(
      new NextRequest("http://localhost/api/projects/project-1/meeting-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Weekly execution review",
          visibility: "public",
        }),
      }),
      projectParams("project-1")
    );
    expect(validCreateResponse.status).toBe(201);
    expect(meetingNoteServiceMock.createProjectMeetingNote).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: "team",
      })
    );

    const invalidUpdateResponse = await updateMeetingNote(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Weekly execution review",
            visibility: "invalid",
          }),
        }
      ),
      noteParams("project-1", "note-1")
    );
    expect(invalidUpdateResponse.status).toBe(400);
    await expect(readJson(invalidUpdateResponse)).resolves.toEqual({
      error: "meeting-note-visibility-invalid",
    });
  });

  test("DELETE and todo PATCH suppress realtime activity broadcast for private notes", async () => {
    meetingNoteServiceMock.deleteProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, visibility: "private" },
    });

    const deleteResponse = await deleteMeetingNote(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1",
        { method: "DELETE" }
      ),
      noteParams("project-1", "note-1")
    );
    expect(deleteResponse.status).toBe(200);
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).not.toHaveBeenCalled();

    meetingNoteServiceMock.setProjectMeetingNoteActionCompletion.mockResolvedValueOnce(
      {
        ok: true,
        data: {
          note: {
            ...sampleNote(),
            visibility: "private",
          },
        },
      }
    );

    const patchTodoResponse = await updateMeetingTodo(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/actions/action-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: true }),
        }
      ),
      actionParams("project-1", "note-1", "action-1")
    );
    expect(patchTodoResponse.status).toBe(200);
    expect(
      activityEventResponseMock.recordProjectActivityEventVersion
    ).not.toHaveBeenCalled();
  });

  describe("ND-547 request contract characterization", () => {
    function mutationRequest(method: "POST" | "PATCH", payload: unknown, headers = {}) {
      return new NextRequest(
        `http://localhost/api/projects/project-1/meeting-notes${method === "PATCH" ? "/note-1" : ""}`,
        {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(payload),
        }
      );
    }

    test.each(["POST", "PATCH"] as const)(
      "%s shares nested participant/action coercion and leaves content normalization to services",
      async (method) => {
        const service = method === "POST"
          ? meetingNoteServiceMock.createProjectMeetingNote
          : meetingNoteServiceMock.updateProjectMeetingNote;
        service.mockResolvedValueOnce({
          ok: true,
          data: { note: sampleNote(), activityVersion: null },
        });
        const payload = {
          title: " Weekly review ",
          scheduledAt: "2026-06-08T14:00:00.000Z",
          participants: [" Guest ", null, 7, { userId: "user-2", displayName: " Alice " }, { userId: 4, displayName: false }],
          labels: [" planning ", 7, null, "review"],
          status: "prepared",
          visibility: " PuBliC ",
          inputNotes: '<p><strong>Prepare</strong> &amp; discuss</p>',
          outputNotes: "<p>Outcome</p>",
          decisions: " Keep spacing ",
          actions: [
            null, 7,
            { id: 7, content: false, completedAt: 7, assignee: { kind: "unknown", id: "x" } },
            { content: "Send recap", assignee: { kind: "participant", id: " Guest " } },
            { content: "Clear assignment", assignee: null },
            { content: "Agent follow-up", assignee: { kind: "agent", id: " credential-1 " } },
            { content: "Human follow-up", assignee: { kind: "human", id: " user-2 " } },
          ],
        };
        const request = mutationRequest(method, payload);
        const response = method === "POST"
          ? await createMeetingNote(request, projectParams("project-1"))
          : await updateMeetingNote(request, noteParams("project-1", "note-1"));
        expect(response.status).toBe(method === "POST" ? 201 : 200);
        expect(service).toHaveBeenCalledWith({
          actorUserId: "user-1",
          projectId: "project-1",
          ...(method === "PATCH" ? { noteId: "note-1" } : {}),
          title: payload.title,
          scheduledAt: payload.scheduledAt,
          participants: [
            { userId: null, displayName: " Guest " },
            { userId: "user-2", displayName: " Alice " },
            { userId: null, displayName: "" },
          ],
          labels: [" planning ", "review"],
          status: "prepared",
          visibility: "team",
          inputNotes: payload.inputNotes,
          outputNotes: payload.outputNotes,
          decisions: payload.decisions,
          actions: [
            { id: null, content: "", completedAt: null, assignee: undefined },
            { id: null, content: "Send recap", completedAt: null, assignee: { kind: "participant", id: "Guest" } },
            { id: null, content: "Clear assignment", completedAt: null, assignee: null },
            { id: null, content: "Agent follow-up", completedAt: null, assignee: { kind: "agent", id: "credential-1" } },
            { id: null, content: "Human follow-up", completedAt: null, assignee: { kind: "human", id: "user-2" } },
          ],
        });
      }
    );

    test("POST keeps its legacy defaults for missing or malformed field types", async () => {
      meetingNoteServiceMock.createProjectMeetingNote.mockResolvedValueOnce({
        ok: false, status: 400, error: "meeting-note-title-too-short",
      });
      const response = await createMeetingNote(mutationRequest("POST", {
        title: 7, scheduledAt: 7, participants: false, labels: "planning", status: true,
        inputNotes: {}, outputNotes: null, decisions: 7, actions: "invalid", visibility: null,
      }), projectParams("project-1"));
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: "meeting-note-title-too-short" });
      expect(meetingNoteServiceMock.createProjectMeetingNote).toHaveBeenCalledWith({
        actorUserId: "user-1", projectId: "project-1", title: "", scheduledAt: null,
        participants: [], labels: [], status: null, inputNotes: "", outputNotes: "", decisions: "", actions: [],
      });
    });

    test("PATCH omits untouched fields and preserves revision and response validators", async () => {
      meetingNoteServiceMock.updateProjectMeetingNote.mockResolvedValueOnce({
        ok: true,
        data: { note: { ...sampleNote(), contentRevision: 8 }, activityVersion: new Date("2026-06-08T15:00:00.000Z") },
      });
      const response = await updateMeetingNote(mutationRequest("PATCH", {
        inputNotes: "<p>Changed input only</p>", visibility: "  ",
      }, { "x-content-if-match": '"meeting-note:note-1:7"' }), noteParams("project-1", "note-1"));
      expect(meetingNoteServiceMock.updateProjectMeetingNote.mock.calls[0][0]).toStrictEqual({
        actorUserId: "user-1", projectId: "project-1", noteId: "note-1",
        inputNotes: "<p>Changed input only</p>", expectedRevision: 7,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBe('"meeting-note:note-1:8"');
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-nexusdash-project-version")).toBe("2026-06-08T15:00:00.000Z");
    });

    test("PATCH keeps nonstring date and status clearing semantics", async () => {
      meetingNoteServiceMock.updateProjectMeetingNote.mockResolvedValueOnce({
        ok: true, data: { note: sampleNote(), activityVersion: null },
      });
      const response = await updateMeetingNote(mutationRequest("PATCH", {
        scheduledAt: 17, status: false,
      }), noteParams("project-1", "note-1"));
      expect(response.status).toBe(200);
      expect(meetingNoteServiceMock.updateProjectMeetingNote.mock.calls[0][0]).toStrictEqual({
        actorUserId: "user-1", projectId: "project-1", noteId: "note-1", scheduledAt: null, status: null,
      });
    });

    test.each([
      null, [], 7, "invalid", { participants: null }, { labels: "planning" }, { actions: {} },
      { title: null }, { inputNotes: 7 }, { outputNotes: [] }, { decisions: false },
      { participants: null, visibility: "secret" },
    ].map((payload) => ({ payload })))("PATCH rejects malformed body/content shapes before calling services: %j", async ({ payload }) => {
      const response = await updateMeetingNote(mutationRequest("PATCH", payload), noteParams("project-1", "note-1"));
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: "invalid-request-body" });
      expect(meetingNoteServiceMock.updateProjectMeetingNote).not.toHaveBeenCalled();
    });

    test.each([null, [], true, 7, "invalid"].map((payload) => ({ payload })))(
      "POST returns the standard malformed-body error for non-object JSON: %j",
      async ({ payload }) => {
        const response = await createMeetingNote(mutationRequest("POST", payload), projectParams("project-1"));
        expect(response.status).toBe(400);
        expect(await readJson(response)).toEqual({ error: "invalid-request-body" });
        expect(meetingNoteServiceMock.createProjectMeetingNote).not.toHaveBeenCalled();
      }
    );

    test("PATCH keeps explicit empty writes while ignoring body identities and null visibility", async () => {
      meetingNoteServiceMock.updateProjectMeetingNote.mockResolvedValueOnce({
        ok: true, data: { note: sampleNote(), activityVersion: null },
      });
      const emptyFields = {
        inputNotes: "", outputNotes: "", decisions: "", scheduledAt: null, status: null,
        participants: [], labels: [], actions: [],
      };
      const response = await updateMeetingNote(mutationRequest("PATCH", {
        ...emptyFields, visibility: null,
        actorUserId: "attacker", projectId: "other-project", noteId: "other-note", expectedRevision: 999,
      }), noteParams("project-1", "note-1"));
      expect(response.status).toBe(200);
      expect(meetingNoteServiceMock.updateProjectMeetingNote.mock.calls[0][0]).toStrictEqual({
        actorUserId: "user-1", projectId: "project-1", noteId: "note-1", ...emptyFields,
      });
    });

    test.each(["POST", "PATCH"] as const)("%s checks authentication before malformed JSON", async (method) => {
      apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
        ok: false,
        response: new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        }),
      });
      const request = new NextRequest(
        `http://localhost/api/projects/project-1/meeting-notes${method === "PATCH" ? "/note-1" : ""}`,
        { method, headers: { "content-type": "application/json" }, body: "{" }
      );
      const response = method === "POST"
        ? await createMeetingNote(request, projectParams("project-1"))
        : await updateMeetingNote(request, noteParams("project-1", "note-1"));
      expect(response.status).toBe(401);
      expect(await readJson(response)).toEqual({ error: "unauthorized" });
      expect(meetingNoteServiceMock.createProjectMeetingNote).not.toHaveBeenCalled();
      expect(meetingNoteServiceMock.updateProjectMeetingNote).not.toHaveBeenCalled();
    });

    test("PATCH returns invalid-json after a valid content precondition", async () => {
      const response = await updateMeetingNote(new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1", {
          method: "PATCH", headers: { "x-content-if-match": '"meeting-note:note-1:7"' }, body: "{",
        }
      ), noteParams("project-1", "note-1"));
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: "invalid-json" });
      expect(meetingNoteServiceMock.updateProjectMeetingNote).not.toHaveBeenCalled();
    });

    test("PATCH rejects an invalid revision before parsing malformed JSON", async () => {
      const response = await updateMeetingNote(new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1", {
          method: "PATCH", headers: { "x-content-if-match": "invalid" }, body: "{",
        }
      ), noteParams("project-1", "note-1"));
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: "edit-precondition-invalid" });
      expect(meetingNoteServiceMock.updateProjectMeetingNote).not.toHaveBeenCalled();
    });
  });

});
