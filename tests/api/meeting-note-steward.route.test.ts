import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const apiGuardMock = vi.hoisted(() => ({
  requireApiPrincipal: vi.fn(),
  getAgentProjectAccessContext: vi.fn(),
}));

const meetingNoteServiceMock = vi.hoisted(() => ({
  setProjectMeetingNoteSteward: vi.fn(),
}));

const activityEventResponseMock = vi.hoisted(() => ({
  recordProjectActivityEventVersion: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiPrincipal: apiGuardMock.requireApiPrincipal,
  getAgentProjectAccessContext: apiGuardMock.getAgentProjectAccessContext,
}));

vi.mock("@/lib/services/project-meeting-note-service", () => ({
  setProjectMeetingNoteSteward:
    meetingNoteServiceMock.setProjectMeetingNoteSteward,
}));

vi.mock("@/lib/project-activity-event-response", () => ({
  recordProjectActivityEventVersion:
    activityEventResponseMock.recordProjectActivityEventVersion,
}));

import { PATCH as updateSteward } from "@/app/api/projects/[projectId]/meeting-notes/[noteId]/steward/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
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
    participants: [],
    labels: [],
    status: "actions_in_progress",
    inputNotes: "",
    outputNotes: "",
    decisions: "",
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
      id: "user-1",
      displayName: "Owner",
      usernameTag: "owner#0001",
      avatarSeed: "seed-owner",
      status: "active",
      isAssignable: true,
    },
    updatedBy: {
      kind: "human",
      id: "user-1",
      displayName: "Owner",
      usernameTag: "owner#0001",
      avatarSeed: "seed-owner",
      status: "active",
      isAssignable: true,
    },
    createdAt: new Date("2026-06-08T13:00:00.000Z"),
    updatedAt: new Date("2026-06-08T15:00:00.000Z"),
    actions: [],
  };
}

describe("meeting note steward route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  test("reassigns steward to an active human", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteSteward.mockResolvedValueOnce({
      ok: true,
      data: { note: sampleNote() },
    });

    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steward: { kind: "human", id: "user-2" } }),
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteSteward
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      steward: { kind: "human", id: "user-2" },
      agentAccess: undefined,
    });
  });

  test("clears steward with null", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteSteward.mockResolvedValueOnce({
      ok: true,
      data: { note: sampleNote() },
    });

    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steward: null }),
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(200);
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteSteward
    ).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      steward: null,
      agentAccess: undefined,
    });
  });

  test("rejects malformed steward payloads", async () => {
    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steward: { kind: "alien", id: "x" } }),
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("meeting-note-steward-invalid");
  });

  test("rejects payloads that omit the steward field", async () => {
    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error).toBe("meeting-note-steward-required");
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteSteward
    ).not.toHaveBeenCalled();
  });

  test("rejects a null JSON body without calling the service", async () => {
    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: "null",
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "meeting-note-steward-required",
    });
    expect(
      meetingNoteServiceMock.setProjectMeetingNoteSteward
    ).not.toHaveBeenCalled();
  });

  test("surfaces service errors", async () => {
    meetingNoteServiceMock.setProjectMeetingNoteSteward.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "meeting-note-not-found",
    });

    const response = await updateSteward(
      new NextRequest(
        "http://localhost/api/projects/project-1/meeting-notes/note-1/steward",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steward: { kind: "human", id: "user-2" } }),
        }
      ),
      noteParams("project-1", "note-1")
    );

    expect(response.status).toBe(404);
    const payload = await readJson(response);
    expect(payload.error).toBe("meeting-note-not-found");
  });
});
