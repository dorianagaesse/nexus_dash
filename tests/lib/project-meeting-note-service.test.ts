import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
  requireAgentProjectScopes: vi.fn(),
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
    findUnique: vi.fn(),
  },
  user: { findUnique: vi.fn() },
  apiCredential: { findFirst: vi.fn() },
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
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
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
  setProjectMeetingNoteActionAssignee,
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
      creatorKind: "human" as const,
      createdByUserId: "user-1",
      createdByCredentialId: null,
      creatorDisplayNameSnapshot: "owner",
      createdByUser: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-owner",
      },
      createdByCredential: null,
      assigneeKind: null,
      assigneeUserId: null,
      assigneeCredentialId: null,
      assigneeDisplayNameSnapshot: null,
      assigneeUser: null,
      assigneeCredential: null,
      completedByKind: null,
      completedByUserId: null,
      completedByCredentialId: null,
      completedByDisplayNameSnapshot: null,
      completedByUser: null,
      completedByCredential: null,
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
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
    const owner = {
      id: "user-1",
      name: "Owner",
      email: "owner@example.com",
      username: "owner",
      usernameDiscriminator: "0001",
      avatarSeed: "seed-owner",
    };
    dbMock.project.findUnique.mockResolvedValue({
      owner,
      memberships: [],
      apiCredentials: [],
    });
    dbMock.user.findUnique.mockResolvedValue(owner);
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
              creatorKind: "human",
              createdByUserId: "user-1",
              createdByCredentialId: null,
              creatorDisplayNameSnapshot: "owner",
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
            },
            {
              content: "Update roadmap",
              completedAt: new Date("2026-06-08T15:00:00.000Z"),
              position: 1,
              creatorKind: "human",
              createdByUserId: "user-1",
              createdByCredentialId: null,
              creatorDisplayNameSnapshot: "owner",
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
              completedByKind: "human",
              completedByUserId: "user-1",
              completedByCredentialId: null,
              completedByDisplayNameSnapshot: "owner",
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

  test("updates a note while preserving an existing follow-up identity", async () => {
    dbMock.projectMeetingNote.findFirst
      .mockResolvedValueOnce({
        id: "note-1",
        actions: [{ id: "action-1" }],
      })
      .mockResolvedValueOnce({
        ...baseMeetingNoteRecord,
        title: "Updated review",
        actions: [
          {
            ...baseMeetingNoteRecord.actions[0],
            content: "Updated action",
          },
        ],
      });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });

    const result = await updateProjectMeetingNote({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      title: "Updated review",
      actions: [{ id: "action-1", content: "Updated action" }],
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
          deleteMany: { id: { notIn: ["action-1"] } },
          update: [
            {
              where: { id: "action-1" },
              data: { content: "Updated action", position: 0 },
            },
          ],
          create: [],
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
      data: {
        completedAt: expect.any(Date),
        completedByKind: "human",
        completedByUserId: "user-1",
        completedByCredentialId: null,
        completedByDisplayNameSnapshot: "owner",
      },
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
      data: {
        completedAt: null,
        completedByKind: null,
        completedByUserId: null,
        completedByCredentialId: null,
        completedByDisplayNameSnapshot: null,
      },
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

  test("assigns an active project agent and preserves its credential identity", async () => {
    dbMock.project.findUnique.mockResolvedValueOnce({
      owner: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-owner",
      },
      memberships: [],
      apiCredentials: [
        {
          id: "credential-1",
          label: "Release agent",
          projectId: "project-1",
          revokedAt: null,
          expiresAt: null,
        },
      ],
    });
    dbMock.projectMeetingNoteAction.findFirst.mockResolvedValueOnce({ id: "action-1" });
    dbMock.projectMeetingNoteAction.update.mockResolvedValueOnce({ id: "action-1" });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce({
      ...baseMeetingNoteRecord,
      actions: [
        {
          ...baseMeetingNoteRecord.actions[0],
          assigneeKind: "agent",
          assigneeCredentialId: "credential-1",
          assigneeDisplayNameSnapshot: "Release agent",
          assigneeCredential: {
            id: "credential-1",
            label: "Release agent",
            projectId: "project-1",
            revokedAt: null,
            expiresAt: null,
          },
        },
      ],
    });

    const result = await setProjectMeetingNoteActionAssignee({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      assignee: { kind: "agent", id: "credential-1" },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        note: {
          actions: [
            {
              assignee: {
                kind: "agent",
                id: "credential-1",
                displayName: "Release agent",
                status: "active",
              },
            },
          ],
        },
      },
    });
    expect(dbMock.projectMeetingNoteAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        assigneeKind: "agent",
        assigneeUserId: null,
        assigneeCredentialId: "credential-1",
        assigneeDisplayNameSnapshot: "Release agent",
      },
    });
  });

  test("rejects assignment to a revoked agent credential", async () => {
    dbMock.project.findUnique.mockResolvedValueOnce({
      owner: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        username: "owner",
        usernameDiscriminator: "0001",
        avatarSeed: "seed-owner",
      },
      memberships: [],
      apiCredentials: [
        {
          id: "credential-revoked",
          label: "Former agent",
          projectId: "project-1",
          revokedAt: new Date("2026-08-01T00:00:00.000Z"),
          expiresAt: null,
        },
      ],
    });
    dbMock.projectMeetingNoteAction.findFirst.mockResolvedValueOnce({ id: "action-1" });

    await expect(
      setProjectMeetingNoteActionAssignee({
        actorUserId: "user-1",
        projectId: "project-1",
        noteId: "note-1",
        actionId: "action-1",
        assignee: { kind: "agent", id: "credential-revoked" },
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "meeting-note-action-assignee-invalid",
    });
    expect(dbMock.projectMeetingNoteAction.update).not.toHaveBeenCalled();
  });

  test("records the credential when an authorized agent completes a todo", async () => {
    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValueOnce({ ok: true });
    dbMock.apiCredential.findFirst.mockResolvedValueOnce({
      id: "credential-1",
      label: "Release agent",
      projectId: "project-1",
      revokedAt: null,
      expiresAt: null,
    });
    dbMock.projectMeetingNoteAction.findFirst.mockResolvedValueOnce({
      id: "action-1",
      meetingNote: { status: "actions_in_progress" },
    });
    dbMock.projectMeetingNoteAction.update.mockResolvedValueOnce({ id: "action-1" });
    dbMock.projectMeetingNote.update.mockResolvedValueOnce({ id: "note-1" });
    dbMock.projectMeetingNote.findFirst.mockResolvedValueOnce(baseMeetingNoteRecord);

    const result = await setProjectMeetingNoteActionCompletion({
      actorUserId: "user-1",
      projectId: "project-1",
      noteId: "note-1",
      actionId: "action-1",
      completed: true,
      agentAccess: {
        credentialId: "credential-1",
        projectId: "project-1",
        scopes: ["task:write"],
      },
    });

    expect(result.ok).toBe(true);
    expect(dbMock.projectMeetingNoteAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: expect.objectContaining({
        completedByKind: "agent",
        completedByUserId: null,
        completedByCredentialId: "credential-1",
        completedByDisplayNameSnapshot: "Release agent",
      }),
    });
  });
});
