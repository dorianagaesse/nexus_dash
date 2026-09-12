import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: {
    findFirst: vi.fn(),
  },
  taskCommentAgentMention: {
    findMany: vi.fn(),
  },
  task: {
    findMany: vi.fn(),
  },
  projectMeetingNoteAction: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: dbMock,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(
    (_actorUserId: string, callback: (db: typeof dbMock) => unknown) =>
      callback(dbMock)
  ),
}));

import {
  decodeAgentAttentionCursor,
  encodeAgentAttentionCursor,
  type AgentAttentionListFilters,
} from "@/lib/agent-attention";
import {
  listAgentAssignments,
  listAgentMentionEvents,
  mapAgentAssignmentItemToResponse,
  mapAgentMentionItemToResponse,
} from "@/lib/services/project-agent-attention-service";

const AGENT_ACCESS = {
  credentialId: "credential-1",
  projectId: "project-1",
  scopes: ["attention:read"],
};

const PERSON_ROW = {
  id: "user-1",
  name: "Reviewer",
  email: "reviewer@example.com",
  username: "reviewer",
  usernameDiscriminator: "0007",
  avatarSeed: null,
};

const HUMAN_REGISTRY_ROW = {
  kind: "human",
  actorId: "user-1",
  name: "Reviewer",
  email: "reviewer@example.com",
  username: "reviewer",
  usernameDiscriminator: "0007",
  avatarSeed: null,
  label: null,
  revokedAt: null,
  expiresAt: null,
};

function agentRegistryRow(input: { actorId: string; label: string }) {
  return {
    kind: "agent",
    actorId: input.actorId,
    name: null,
    email: null,
    username: null,
    usernameDiscriminator: null,
    avatarSeed: null,
    label: input.label,
    revokedAt: null,
    expiresAt: null,
  };
}

const HUMAN_ACTOR = {
  kind: "human",
  id: "user-1",
  displayName: "reviewer",
  usernameTag: "reviewer#0007",
};

function defaultFilters(
  overrides: Partial<AgentAttentionListFilters> = {}
): AgentAttentionListFilters {
  return {
    eventType: null,
    artifactType: null,
    state: null,
    since: null,
    until: null,
    limit: 50,
    order: "desc",
    cursor: null,
    ...overrides,
  };
}

function mentionInput(overrides: {
  actorUserId?: string;
  agentAccess?: typeof AGENT_ACCESS | null;
  filters?: Partial<AgentAttentionListFilters>;
} = {}) {
  return {
    actorUserId: overrides.actorUserId ?? "user-1",
    projectId: "project-1",
    agentAccess:
      overrides.agentAccess === null
        ? undefined
        : overrides.agentAccess ?? AGENT_ACCESS,
    filters: defaultFilters(overrides.filters),
  };
}

function assignmentInput(overrides: {
  actorUserId?: string;
  agentAccess?: typeof AGENT_ACCESS | null;
  filters?: Partial<AgentAttentionListFilters>;
} = {}) {
  return mentionInput(overrides);
}

function mentionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mention-1",
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    commentId: "comment-1",
    taskId: "task-1",
    agentCredentialId: "credential-1",
    agentLabel: "Release bot",
    createdByUserId: "user-1",
    createdByCredentialId: null,
    createdByCredentialLabel: null,
    task: {
      id: "task-1",
      title: "Release task",
      status: "Todo",
      archivedAt: null,
    },
    createdByUser: PERSON_ROW,
    ...overrides,
  };
}

function assignmentTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Ship the release",
    status: "Todo",
    archivedAt: null,
    assigneeAssignedAt: new Date("2026-09-12T11:00:00.000Z"),
    assigneeAssignedByKind: "human",
    assigneeAssignedByUserId: "user-1",
    assigneeAssignedByCredentialId: null,
    assigneeAssignedByDisplayNameSnapshot: "reviewer",
    assigneeAssignedByUser: PERSON_ROW,
    assigneeDisplayNameSnapshot: "Release bot",
    ...overrides,
  };
}

function meetingTodoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "todo-1",
    content: "Cut the release notes",
    completedAt: null,
    assignedAt: new Date("2026-09-12T12:00:00.000Z"),
    meetingNoteId: "note-1",
    assignedByKind: "agent",
    assignedByUserId: "user-1",
    assignedByCredentialId: "credential-2",
    assignedByDisplayNameSnapshot: "Build bot",
    assigneeDisplayNameSnapshot: "Release bot",
    assignedByUser: PERSON_ROW,
    meetingNote: { id: "note-1", title: "Weekly sync" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.project.findFirst.mockResolvedValue({
    ownerId: "user-1",
    memberships: [{ role: "editor" }],
  });
  dbMock.$queryRaw.mockResolvedValue([
    HUMAN_REGISTRY_ROW,
    agentRegistryRow({ actorId: "credential-1", label: "Release bot v2" }),
    agentRegistryRow({ actorId: "credential-2", label: "Build bot" }),
  ]);
  dbMock.taskCommentAgentMention.findMany.mockResolvedValue([]);
  dbMock.task.findMany.mockResolvedValue([]);
  dbMock.projectMeetingNoteAction.findMany.mockResolvedValue([]);
});

describe("listAgentMentionEvents authorization", () => {
  test("rejects a missing actor before touching the database", async () => {
    const result = await listAgentMentionEvents(mentionInput({ actorUserId: "" }));

    expect(result).toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(dbMock.taskCommentAgentMention.findMany).not.toHaveBeenCalled();
  });

  test("rejects human principals", async () => {
    const result = await listAgentMentionEvents(
      mentionInput({ agentAccess: null })
    );

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
  });

  test("rejects credentials without the attention:read scope", async () => {
    const result = await listAgentMentionEvents(
      mentionInput({
        agentAccess: { ...AGENT_ACCESS, scopes: ["task:read", "project:read"] },
      })
    );

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(dbMock.taskCommentAgentMention.findMany).not.toHaveBeenCalled();
  });

  test("rejects credentials scoped to another project", async () => {
    const result = await listAgentMentionEvents(
      mentionInput({
        agentAccess: { ...AGENT_ACCESS, projectId: "other-project" },
      })
    );

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
    expect(dbMock.taskCommentAgentMention.findMany).not.toHaveBeenCalled();
  });

  test("requires project membership before listing", async () => {
    dbMock.project.findFirst.mockResolvedValueOnce(null);

    const result = await listAgentMentionEvents(mentionInput());

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });
    expect(dbMock.taskCommentAgentMention.findMany).not.toHaveBeenCalled();
  });
});

describe("listAgentMentionEvents filters", () => {
  test.each([
    { eventType: "assignment" as const },
    { artifactType: "meeting_todo" as const },
    { state: "active" as const },
  ])("rejects filters outside the mention surface %#", async (filters) => {
    const result = await listAgentMentionEvents(mentionInput({ filters }));

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "agent-attention-invalid-filter",
    });
    expect(dbMock.taskCommentAgentMention.findMany).not.toHaveBeenCalled();
  });

  test("only reads rows owned by the authenticated credential inside the project", async () => {
    await listAgentMentionEvents(mentionInput());

    expect(dbMock.taskCommentAgentMention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentCredentialId: "credential-1",
          task: { projectId: "project-1" },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
      })
    );
  });

  test("applies the since/until window to the mention timestamp", async () => {
    const since = new Date("2026-09-01T00:00:00.000Z");
    const until = new Date("2026-09-13T00:00:00.000Z");

    await listAgentMentionEvents(mentionInput({ filters: { since, until } }));

    expect(dbMock.taskCommentAgentMention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentCredentialId: "credential-1",
          task: { projectId: "project-1" },
          createdAt: { gte: since, lte: until },
        },
      })
    );
  });

  test("applies order and the cursor tie-break to the query", async () => {
    const cursorOccurredAt = new Date("2026-09-12T10:00:00.000Z");

    await listAgentMentionEvents(
      mentionInput({
        filters: {
          order: "asc",
          cursor: {
            order: "asc",
            occurredAt: cursorOccurredAt,
            id: "mention-row-9",
          },
        },
      })
    );

    expect(dbMock.taskCommentAgentMention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentCredentialId: "credential-1",
          task: { projectId: "project-1" },
          OR: [
            { createdAt: { gt: cursorOccurredAt } },
            { createdAt: cursorOccurredAt, id: { gt: "mention-row-9" } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    );
  });

  test("wraps database failures as a 500", async () => {
    dbMock.taskCommentAgentMention.findMany.mockRejectedValueOnce(
      new Error("connection lost")
    );

    const result = await listAgentMentionEvents(mentionInput());

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "agent-attention-list-failed",
    });
  });
});

describe("listAgentMentionEvents results", () => {
  test("maps mentions into attention items with stable keys and dedup-safe cursors", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      mentionRow({ id: "row-1" }),
      mentionRow({ id: "row-2" }),
      mentionRow({ id: "row-3" }),
    ]);

    const result = await listAgentMentionEvents(
      mentionInput({ filters: { limit: 2 } })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.items).toEqual([
      {
        id: "mention:row-1",
        eventType: "mention",
        projectId: "project-1",
        occurredAt: new Date("2026-09-12T10:00:00.000Z"),
        artifact: {
          type: "task_comment",
          id: "comment-1",
          taskId: "task-1",
          taskTitle: "Release task",
        },
        summary:
          'reviewer mentioned Release bot v2 (agent) in a comment on "Release task"',
        actor: HUMAN_ACTOR,
        currentState: { status: "Todo", archivedAt: null },
      },
      {
        id: "mention:row-2",
        eventType: "mention",
        projectId: "project-1",
        occurredAt: new Date("2026-09-12T10:00:00.000Z"),
        artifact: {
          type: "task_comment",
          id: "comment-1",
          taskId: "task-1",
          taskTitle: "Release task",
        },
        summary:
          'reviewer mentioned Release bot v2 (agent) in a comment on "Release task"',
        actor: HUMAN_ACTOR,
        currentState: { status: "Todo", archivedAt: null },
      },
    ]);
    expect(result.data.nextCursor).toEqual(expect.any(String));
    expect(decodeAgentAttentionCursor(result.data.nextCursor)).toEqual({
      order: "desc",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      id: "row-2",
    });
  });

  test("returns no cursor when the page ends exactly on the limit", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      mentionRow({ id: "row-1" }),
      mentionRow({ id: "row-2" }),
    ]);

    const result = await listAgentMentionEvents(
      mentionInput({ filters: { limit: 2 } })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.nextCursor).toBeNull();
    }
  });

  test("resolves an agent author as the event actor", async () => {
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      mentionRow({
        createdByUserId: "user-1",
        createdByCredentialId: "credential-2",
        createdByCredentialLabel: "Build bot",
      }),
    ]);

    const result = await listAgentMentionEvents(mentionInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.items[0]).toMatchObject({
      summary:
        'Build bot (agent) mentioned Release bot v2 (agent) in a comment on "Release task"',
      actor: {
        kind: "agent",
        id: "credential-2",
        displayName: "Build bot (agent)",
        usernameTag: null,
      },
    });
  });

  test("falls back to the mention snapshot when the registry lost the credential", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([HUMAN_REGISTRY_ROW]);
    dbMock.taskCommentAgentMention.findMany.mockResolvedValueOnce([
      mentionRow(),
    ]);

    const result = await listAgentMentionEvents(mentionInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]?.summary).toContain(
        "mentioned Release bot (agent)"
      );
    }
  });
});

describe("listAgentAssignments", () => {
  test("rejects human principals", async () => {
    const result = await listAgentAssignments(
      assignmentInput({ agentAccess: null })
    );

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
  });

  test("rejects filters outside the assignment surface", async () => {
    for (const filters of [
      { eventType: "mention" as const },
      { artifactType: "task_comment" as const },
    ]) {
      const result = await listAgentAssignments(assignmentInput({ filters }));
      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "agent-attention-invalid-filter",
      });
    }
    expect(dbMock.task.findMany).not.toHaveBeenCalled();
    expect(dbMock.projectMeetingNoteAction.findMany).not.toHaveBeenCalled();
  });

  test("merges tasks and meeting to-dos sorted newest first", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([assignmentTaskRow()]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([
      meetingTodoRow(),
    ]);

    const result = await listAgentAssignments(assignmentInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual({
      items: [
        {
          id: "assignment:meeting_todo:todo-1",
          eventType: "assignment",
          projectId: "project-1",
          occurredAt: new Date("2026-09-12T12:00:00.000Z"),
          artifact: {
            type: "meeting_todo",
            id: "todo-1",
            content: "Cut the release notes",
            meetingNoteId: "note-1",
            meetingNoteTitle: "Weekly sync",
          },
          summary:
            'Build bot (agent) assigned Release bot v2 (agent) to the meeting to-do "Cut the release notes" in "Weekly sync"',
          actor: {
            kind: "agent",
            id: "credential-2",
            displayName: "Build bot (agent)",
            usernameTag: null,
          },
          currentState: {
            assignmentState: "active",
            status: "open",
            archivedAt: null,
          },
        },
        {
          id: "assignment:task:task-1",
          eventType: "assignment",
          projectId: "project-1",
          occurredAt: new Date("2026-09-12T11:00:00.000Z"),
          artifact: { type: "task", id: "task-1", title: "Ship the release" },
          summary:
            'reviewer assigned Release bot v2 (agent) to task "Ship the release"',
          actor: HUMAN_ACTOR,
          currentState: {
            assignmentState: "active",
            status: "Todo",
            archivedAt: null,
          },
        },
      ],
      nextCursor: null,
    });
  });

  test("reads only the credential's own assignments inside the project", async () => {
    await listAgentAssignments(assignmentInput());

    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project-1",
          assigneeCredentialId: "credential-1",
        },
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeCredentialId: "credential-1",
          meetingNote: { projectId: "project-1" },
        },
      })
    );
  });

  test("applies state filters per artifact source", async () => {
    await listAgentAssignments(assignmentInput({ filters: { state: "completed" } }));

    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "Done" }),
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ completedAt: { not: null } }),
      })
    );
  });

  test("maps active state to unfinished work in both sources", async () => {
    await listAgentAssignments(assignmentInput({ filters: { state: "active" } }));

    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "Done" } }),
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ completedAt: null }),
      })
    );
  });

  test("applies the time window to each source's assignment timestamp", async () => {
    const since = new Date("2026-09-01T00:00:00.000Z");
    const until = new Date("2026-09-13T00:00:00.000Z");

    await listAgentAssignments(assignmentInput({ filters: { since, until } }));

    expect(dbMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeAssignedAt: { gte: since, lte: until },
        }),
      })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedAt: { gte: since, lte: until },
        }),
      })
    );
  });

  test("skips a source entirely when artifactType excludes it", async () => {
    await listAgentAssignments(
      assignmentInput({ filters: { artifactType: "task" } })
    );
    expect(dbMock.projectMeetingNoteAction.findMany).not.toHaveBeenCalled();

    dbMock.task.findMany.mockClear();
    await listAgentAssignments(
      assignmentInput({ filters: { artifactType: "meeting_todo" } })
    );
    expect(dbMock.task.findMany).not.toHaveBeenCalled();
  });

  test("paginates deterministically across both sources, treating missing times as oldest", async () => {
    const legacyTask = assignmentTaskRow({
      id: "task-legacy",
      title: "Legacy task",
      assigneeAssignedAt: null,
      assigneeAssignedByKind: null,
      assigneeAssignedByUserId: null,
      assigneeAssignedByDisplayNameSnapshot: null,
      assigneeAssignedByUser: null,
      assigneeDisplayNameSnapshot: null,
    });
    dbMock.task.findMany.mockResolvedValue([
      assignmentTaskRow(),
      legacyTask,
    ]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValue([
      meetingTodoRow(),
    ]);

    const firstPage = await listAgentAssignments(
      assignmentInput({ filters: { limit: 2 } })
    );

    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) {
      return;
    }
    expect(firstPage.data.items.map((item) => item.id)).toEqual([
      "assignment:meeting_todo:todo-1",
      "assignment:task:task-1",
    ]);
    expect(firstPage.data.nextCursor).toEqual(expect.any(String));

    const cursor = decodeAgentAttentionCursor(firstPage.data.nextCursor);
    expect(cursor).not.toBeNull();

    const secondPage = await listAgentAssignments(
      assignmentInput({ filters: { limit: 2, cursor } })
    );

    expect(secondPage.ok).toBe(true);
    if (!secondPage.ok) {
      return;
    }
    expect(secondPage.data.items).toEqual([
      {
        id: "assignment:task:task-legacy",
        eventType: "assignment",
        projectId: "project-1",
        occurredAt: null,
        artifact: {
          type: "task",
          id: "task-legacy",
          title: "Legacy task",
        },
        summary:
          'Unknown actor assigned Release bot v2 (agent) to task "Legacy task"',
        actor: null,
        currentState: {
          assignmentState: "active",
          status: "Todo",
          archivedAt: null,
        },
      },
    ]);
    expect(secondPage.data.nextCursor).toBeNull();
  });

  test("marks completed artifacts in the current state", async () => {
    dbMock.task.findMany.mockResolvedValueOnce([
      assignmentTaskRow({ status: "Done", archivedAt: null }),
    ]);
    dbMock.projectMeetingNoteAction.findMany.mockResolvedValueOnce([
      meetingTodoRow({ completedAt: new Date("2026-09-12T15:00:00.000Z") }),
    ]);

    const result = await listAgentAssignments(assignmentInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.data.items.map((item) => item.currentState)
    ).toEqual([
      { assignmentState: "completed", status: "completed", archivedAt: null },
      { assignmentState: "completed", status: "Done", archivedAt: null },
    ]);
  });

  test("wraps database failures as a 500", async () => {
    dbMock.task.findMany.mockRejectedValueOnce(new Error("connection lost"));

    const result = await listAgentAssignments(assignmentInput());

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "agent-attention-list-failed",
    });
  });
});

describe("agent attention response mappers", () => {
  test("serializes mention items", () => {
    expect(
      mapAgentMentionItemToResponse({
        id: "mention:row-1",
        eventType: "mention",
        projectId: "project-1",
        occurredAt: new Date("2026-09-12T10:00:00.000Z"),
        artifact: {
          type: "task_comment",
          id: "comment-1",
          taskId: "task-1",
          taskTitle: "Release task",
        },
        summary: "summary",
        actor: HUMAN_ACTOR,
        currentState: {
          status: "Todo",
          archivedAt: new Date("2026-09-12T11:00:00.000Z"),
        },
      })
    ).toEqual({
      id: "mention:row-1",
      eventType: "mention",
      projectId: "project-1",
      occurredAt: "2026-09-12T10:00:00.000Z",
      artifact: {
        type: "task_comment",
        id: "comment-1",
        taskId: "task-1",
        taskTitle: "Release task",
      },
      summary: "summary",
      actor: HUMAN_ACTOR,
      currentState: {
        status: "Todo",
        archivedAt: "2026-09-12T11:00:00.000Z",
      },
    });
  });

  test("serializes assignment items, keeping null legacy timestamps null", () => {
    const response = mapAgentAssignmentItemToResponse({
      id: "assignment:task:task-legacy",
      eventType: "assignment",
      projectId: "project-1",
      occurredAt: null,
      artifact: { type: "task", id: "task-legacy", title: "Legacy task" },
      summary: "summary",
      actor: null,
      currentState: {
        assignmentState: "active",
        status: "Todo",
        archivedAt: null,
      },
    });

    expect(response.occurredAt).toBeNull();
    expect(response.actor).toBeNull();
    expect(response.currentState).toEqual({
      assignmentState: "active",
      status: "Todo",
      archivedAt: null,
    });
  });
});

test("encode and decode stay symmetric for the service cursor shape", () => {
  const cursor = {
    order: "desc" as const,
    occurredAt: new Date("2026-09-12T10:00:00.000Z"),
    id: "row-2",
  };
  expect(decodeAgentAttentionCursor(encodeAgentAttentionCursor(cursor))).toEqual(
    cursor
  );
});
