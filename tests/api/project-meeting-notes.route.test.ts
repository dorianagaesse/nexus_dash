import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const meetingNoteServiceMock = vi.hoisted(() => ({
  listProjectMeetingNotes: vi.fn(),
  createProjectMeetingNote: vi.fn(),
  updateProjectMeetingNote: vi.fn(),
  deleteProjectMeetingNote: vi.fn(),
}));

const activityEventResponseMock = vi.hoisted(() => ({
  recordProjectActivityEventVersion: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/services/project-meeting-note-service", () => ({
  listProjectMeetingNotes: meetingNoteServiceMock.listProjectMeetingNotes,
  createProjectMeetingNote: meetingNoteServiceMock.createProjectMeetingNote,
  updateProjectMeetingNote: meetingNoteServiceMock.updateProjectMeetingNote,
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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function projectParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

function noteParams(projectId: string, noteId: string) {
  return { params: Promise.resolve({ projectId, noteId }) };
}

function sampleNote() {
  return {
    id: "note-1",
    projectId: "project-1",
    title: "Weekly execution review",
    scheduledAt: new Date("2026-06-08T14:00:00.000Z"),
    participants: ["Dorian", "Camille"],
    inputNotes: "Review roadmap risks.",
    outputNotes: "Scope was clarified.",
    decisions: "Keep TASK-098 focused.",
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
    await expect(readJson(response)).resolves.toEqual({
      notes: [
        {
          id: "note-1",
          projectId: "project-1",
          title: "Weekly execution review",
          scheduledAt: "2026-06-08T14:00:00.000Z",
          participants: ["Dorian", "Camille"],
          inputNotes: "Review roadmap risks.",
          outputNotes: "Scope was clarified.",
          decisions: "Keep TASK-098 focused.",
          createdAt: "2026-06-08T13:00:00.000Z",
          updatedAt: "2026-06-08T15:00:00.000Z",
          actions: [
            {
              id: "action-1",
              content: "Send recap",
              completedAt: null,
              position: 0,
            },
          ],
        },
      ],
    });
    expect(meetingNoteServiceMock.listProjectMeetingNotes).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "recap",
    });
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
      participants: ["Dorian", "Camille"],
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
      participants: ["Dorian"],
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
