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
  project: {
    findFirst: vi.fn(),
  },
  projectMeetingNote: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  projectMeetingNoteAction: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

function externalParticipant(displayName: string, position: number) {
  return {
    userId: null,
    displayName,
    position,
    user: null,
  };
}

function linkedParticipant(
  user: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  },
  position: number
) {
  return {
    userId: user.id,
    displayName: user.username ?? user.name ?? "Account",
    position,
    user,
  };
}

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
  setProjectMeetingNoteActionCompletion,
  updateProjectMeetingNote,
} from "@/lib/services/project-meeting-note-service";

const baseMeetingNoteRecord = {
  id: "note-1",
  projectId: "project-1",
  title: "Weekly execution review",
  scheduledAt: new Date("2026-06-08T14:00:00.000Z"),
  participants: [
    externalParticipant("Dorian", 0),
    externalParticipant("Camille", 1),
  ],
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
      participants: [externalParticipant("Morgan", 0)],
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
      participants: [
        {
          userId: null,
          displayName: "Dorian",
          usernameTag: null,
          avatarSeed: null,
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
        participants: {
          create: [
            { userId: null, displayName: "Dorian", position: 0 },
            { userId: null, displayName: "Camille", position: 1 },
          ],
        },
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

  test("links current collaborators and resolves their live avatar identity", async () => {
    const collaborator = {
      id: "user-2",
      name: "Camille Example",
      email: "camille@example.com",
      username: "camille",
      usernameDiscriminator: "0042",
      avatarSeed: "seed-camille",
    };
    dbMock.project.findFirst.mockResolvedValueOnce({
      owner: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-owner",
      },
      memberships: [{ user: collaborator }],
    });
    dbMock.projectMeetingNote.create.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce({
      ...baseMeetingNoteRecord,
      participants: [linkedParticipant(collaborator, 0)],
    });

    const result = await createProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Collaborator sync",
      participants: [
        {
          userId: "user-2",
          displayName: "Untrusted client label",
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        note: {
          participants: [
            {
              userId: "user-2",
              displayName: "camille",
              usernameTag: "camille#0042",
              avatarSeed: "seed-camille",
            },
          ],
        },
      },
    });
    expect(dbMock.projectMeetingNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participants: {
            create: [
              {
                userId: "user-2",
                displayName: "camille",
                position: 0,
              },
            ],
          },
        }),
      })
    );
  });

  test("rejects linked users who are not current project collaborators", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce({
      owner: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-owner",
      },
      memberships: [],
    });

    const result = await createProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      title: "Collaborator sync",
      participants: [{ userId: "user-outside", displayName: "Outside user" }],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "meeting-note-participant-user-invalid",
    });
    expect(dbMock.projectMeetingNote.create).not.toHaveBeenCalled();
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
        participants: {
          deleteMany: {},
          create: [],
        },
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

  test("completes one meeting todo without replacing sibling actions", async () => {
    dbMock.projectMeetingNoteAction.findFirst.mockResolvedValueOnce({
      id: "action-1",
      meetingNote: { status: "actions_in_progress" },
    });
    dbMock.projectMeetingNoteAction.update.mockResolvedValueOnce({ id: "action-1" });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce({
      ...baseMeetingNoteRecord,
      actions: [
        {
          ...baseMeetingNoteRecord.actions[0],
          completedAt: new Date("2026-06-08T16:00:00.000Z"),
        },
      ],
    });

    const result = await setProjectMeetingNoteActionCompletion({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: true,
    });

    expect(result.ok).toBe(true);
    expect(dbMock.projectMeetingNoteAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { completedAt: expect.any(Date) },
    });
    expect(dbMock.projectMeetingNote.update).toHaveBeenCalledWith({
      where: { id: "note-1" },
      data: { updatedByUserId: "user-1" },
    });
    expect(projectActivityServiceMock.touchProjectActivity).toHaveBeenCalledWith({
      db: dbMock,
      projectId: "project-1",
    });
  });

  test("reopens a todo and reactivates its archived meeting note", async () => {
    dbMock.projectMeetingNoteAction.findFirst.mockResolvedValueOnce({
      id: "action-1",
      meetingNote: { status: "done" },
    });
    dbMock.projectMeetingNoteAction.update.mockResolvedValueOnce({ id: "action-1" });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce({
      ...baseMeetingNoteRecord,
      status: "actions_in_progress",
      actions: [{ ...baseMeetingNoteRecord.actions[0], completedAt: null }],
    });

    const result = await setProjectMeetingNoteActionCompletion({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: false,
    });

    expect(result.ok).toBe(true);
    expect(dbMock.projectMeetingNoteAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { completedAt: null },
    });
    expect(dbMock.projectMeetingNote.update).toHaveBeenCalledWith({
      where: { id: "note-1" },
      data: {
        status: "actions_in_progress",
        updatedByUserId: "user-1",
      },
    });
  });

  test("rejects viewer todo mutations", async () => {
    projectAccessServiceMock.requireProjectRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const result = await setProjectMeetingNoteActionCompletion({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: true,
    });

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(dbMock.projectMeetingNoteAction.update).not.toHaveBeenCalled();
  });
});
