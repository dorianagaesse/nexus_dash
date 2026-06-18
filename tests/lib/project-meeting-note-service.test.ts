import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const projectActivityServiceMock = vi.hoisted(() => ({
  touchProjectActivity: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  projectMeetingNote: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  touchProjectActivity: projectActivityServiceMock.touchProjectActivity,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  createProjectMeetingNote,
  listProjectMeetingNotes,
  updateProjectMeetingNote,
} from "@/lib/services/project-meeting-note-service";

const baseMeetingNoteRecord = {
  id: "note-1",
  projectId: "project-1",
  title: "Weekly execution review",
  scheduledAt: new Date("2026-06-08T14:00:00.000Z"),
  participants: ["Dorian", "Camille"],
  labelsJson: JSON.stringify(["planning"]),
  status: "actions_in_progress",
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

describe("project-meeting-note-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "editor",
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
    projectActivityServiceMock.touchProjectActivity.mockResolvedValue(
      new Date("2026-06-08T15:00:00.000Z")
    );
  });

  test("lists notes and filters search across participants, outputs, and actions", async () => {
    dbMock.projectMeetingNote.findMany.mockResolvedValueOnce([
      baseMeetingNoteRecord,
      {
        ...baseMeetingNoteRecord,
      id: "note-2",
      title: "Budget review",
      participants: ["Morgan"],
      labelsJson: JSON.stringify(["finance"]),
      status: "prepared",
      inputNotes: "Cost model.",
      outputNotes: "No schedule change.",
      decisions: "",
        actions: [],
      },
    ]);

    const result = await listProjectMeetingNotes({
      actorUserId: "user-1",
      projectId: "project-1",
      query: "recap",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "note-1",
      title: "Weekly execution review",
      participants: ["Dorian", "Camille"],
      labels: ["planning"],
      status: "actions_in_progress",
      actions: [{ id: "action-1", content: "Send recap" }],
    });
    expect(projectAccessServiceMock.requireProjectRole).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
      minimumRole: "viewer",
      db: dbMock,
    });
  });

  test("creates a structured meeting note and normalizes participants/actions", async () => {
    dbMock.projectMeetingNote.create.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce(baseMeetingNoteRecord);

    const result = await createProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "  Weekly execution review  ",
      scheduledAt: "2026-06-08T14:00:00.000Z",
      participants: [" Dorian ", "dorian", " Camille "],
      labels: [" Planning ", "planning", "sync"],
      status: "actions_in_progress",
      inputNotes: "  Review roadmap risks.  ",
      outputNotes: " Scope was clarified. ",
      decisions: " Keep TASK-098 focused. ",
      actions: [
        { content: " Send recap " },
        { content: "" },
        { content: "Update roadmap", completedAt: "2026-06-08T15:00:00.000Z" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(dbMock.projectMeetingNote.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        title: "Weekly execution review",
        scheduledAt: new Date("2026-06-08T14:00:00.000Z"),
        participants: ["Dorian", "Camille"],
        labelsJson: JSON.stringify(["Planning", "sync"]),
        status: "actions_in_progress",
        inputNotes: "Review roadmap risks.",
        outputNotes: "Scope was clarified.",
        decisions: "Keep TASK-098 focused.",
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
        actions: {
          create: [
            {
              content: "Send recap",
              completedAt: null,
              position: 0,
            },
            {
              content: "Update roadmap",
              completedAt: new Date("2026-06-08T15:00:00.000Z"),
              position: 1,
            },
          ],
        },
      },
      select: { id: true },
    });
    expect(projectActivityServiceMock.touchProjectActivity).toHaveBeenCalledWith({
      db: dbMock,
      projectId: "project-1",
    });
  });

  test("rejects viewer writes through project role enforcement", async () => {
    projectAccessServiceMock.requireProjectRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const result = await createProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Weekly execution review",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(dbMock.projectMeetingNote.create).not.toHaveBeenCalled();
  });

  test("updates a note by replacing follow-up actions in order", async () => {
    dbMock.projectMeetingNote.findFirst
      .mockResolvedValueOnce({ id: "note-1" })
      .mockResolvedValueOnce({
        ...baseMeetingNoteRecord,
        title: "Updated review",
        actions: [
          {
            id: "action-2",
            content: "Updated action",
            completedAt: null,
            position: 0,
          },
        ],
      });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });

    const result = await updateProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      title: "Updated review",
      actions: [{ content: "Updated action" }],
    });

    expect(result.ok).toBe(true);
    expect(dbMock.projectMeetingNote.update).toHaveBeenCalledWith({
      where: { id: "note-1" },
      data: expect.objectContaining({
        title: "Updated review",
        actions: {
          deleteMany: {},
          create: [
            {
              content: "Updated action",
              completedAt: null,
              position: 0,
            },
          ],
        },
      }),
    });
  });

  test("validates titles before entering the database boundary", async () => {
    const result = await createProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "A",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "meeting-note-title-too-short",
    });
    expect(rlsContextMock.withActorRlsContext).not.toHaveBeenCalled();
  });
});
