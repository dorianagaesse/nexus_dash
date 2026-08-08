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
      data: { note: sampleNote() },
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
    expect(activityEventResponseMock.recordProjectActivityEventVersion).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      domain: "meeting-note",
      action: "created",
      entityId: "note-1",
      payload: { noteId: "note-1" },
    });
  });

  test("PATCH updates a meeting note", async () => {
    meetingNoteServiceMock.updateProjectMeetingNote.mockResolvedValueOnce({
      ok: true,
      data: { note: sampleNote() },
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
      scheduledAt: null,
      participants: [{ userId: null, displayName: "Dorian" }],
      labels: [],
      status: null,
      inputNotes: "",
      outputNotes: "",
      decisions: "",
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
});
