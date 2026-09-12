import { describe, expect, test, vi } from "vitest";

const projectServiceMock = vi.hoisted(() => ({
  listProjectKanbanTasks: vi.fn(),
}));

const epicServiceMock = vi.hoisted(() => ({
  listProjectEpics: vi.fn(),
}));

const actorServiceMock = vi.hoisted(() => ({
  loadProjectActorRegistryForActor: vi.fn(),
}));

vi.mock("@/lib/services/project-service", () => ({
  listProjectKanbanTasks: projectServiceMock.listProjectKanbanTasks,
}));

vi.mock("@/lib/services/project-epic-service", () => ({
  listProjectEpics: epicServiceMock.listProjectEpics,
}));

vi.mock("@/lib/services/project-actor-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/services/project-actor-service")
    >();
  return {
    ...original,
    loadProjectActorRegistryForActor:
      actorServiceMock.loadProjectActorRegistryForActor,
  };
});

import { KanbanBoardSection } from "@/app/projects/[projectId]/kanban-board-section";
import type { KanbanTask } from "@/components/kanban-board-types";

const owner = {
  id: "owner-1",
  name: "Owner Example",
  email: "owner@example.com",
  username: "owner",
  usernameDiscriminator: "1234",
  avatarSeed: null,
};

describe("KanbanBoardSection task attribution", () => {
  test("preserves agent task authors when loading the initial Kanban board", async () => {
    projectServiceMock.listProjectKanbanTasks.mockResolvedValueOnce([
      {
        id: "task-1",
        referenceNumber: 42,
        title: "Ship actor identity",
        description: null,
        deadlineAt: null,
        label: null,
        labelsJson: null,
        status: "Backlog",
        position: 0,
        archivedAt: null,
        createdAt: new Date("2026-09-06T10:00:00.000Z"),
        updatedAt: new Date("2026-09-06T11:00:00.000Z"),
        _count: { comments: 0 },
        blockedFollowUps: [],
        attachments: [],
        outgoingRelations: [],
        incomingRelations: [],
        epic: null,
        assigneeUser: null,
        createdByUser: owner,
        updatedByUser: owner,
        createdByCredentialId: "credential-create",
        createdByCredentialLabel: "Release bot",
        updatedByCredentialId: "credential-update",
        updatedByCredentialLabel: "Triage bot",
      },
    ]);
    epicServiceMock.listProjectEpics.mockResolvedValueOnce([]);
    actorServiceMock.loadProjectActorRegistryForActor.mockResolvedValueOnce({
      activeHumanIds: new Set<string>(),
      humanById: new Map(),
      credentialById: new Map(),
      assignable: [
        {
          kind: "agent",
          id: "credential-active",
          displayName: "Release bot",
          usernameTag: null,
          avatarSeed: null,
          status: "active",
          isAssignable: true,
        },
      ],
    });

    const element = await KanbanBoardSection({
      projectId: "project-1",
      actorUserId: "owner-1",
      canEdit: true,
      storageProvider: "local",
      collaborators: [],
    });
    const props = element.props as {
      initialTasks: KanbanTask[];
      projectActors: Array<{ id: string; kind: string }>;
    };

    expect(props.projectActors).toEqual([
      expect.objectContaining({ id: "credential-active", kind: "agent" }),
    ]);

    expect(props.initialTasks[0]?.createdBy).toMatchObject({
      id: "credential-create",
      kind: "agent",
      displayName: "Release bot (agent)",
      agentCredentialId: "credential-create",
      agentCredentialLabel: "Release bot",
      owner: {
        id: "owner-1",
      },
    });
    expect(props.initialTasks[0]?.updatedBy).toMatchObject({
      id: "credential-update",
      kind: "agent",
      displayName: "Triage bot (agent)",
      agentCredentialId: "credential-update",
      agentCredentialLabel: "Triage bot",
    });
  });

  test("resolves live and revoked agent assignees from the loaded registry", async () => {
    const baseTask = {
      id: "task-agent",
      referenceNumber: 43,
      title: "Automate release notes",
      description: null,
      deadlineAt: null,
      label: null,
      labelsJson: null,
      status: "Backlog",
      position: 0,
      archivedAt: null,
      createdAt: new Date("2026-09-06T10:00:00.000Z"),
      updatedAt: new Date("2026-09-06T11:00:00.000Z"),
      _count: { comments: 0 },
      blockedFollowUps: [],
      attachments: [],
      outgoingRelations: [],
      incomingRelations: [],
      epic: null,
      assigneeUser: null,
      assigneeAssignedByKind: null,
      assigneeAssignedByUserId: null,
      assigneeAssignedByCredentialId: null,
      assigneeAssignedByDisplayNameSnapshot: null,
      assigneeAssignedByUser: null,
      assigneeAssignedAt: null,
      createdByUser: owner,
      updatedByUser: owner,
      createdByCredentialId: null,
      createdByCredentialLabel: null,
      updatedByCredentialId: null,
      updatedByCredentialLabel: null,
    };
    projectServiceMock.listProjectKanbanTasks.mockResolvedValueOnce([
      {
        ...baseTask,
        assigneeKind: "agent",
        assigneeCredentialId: "credential-active",
        assigneeDisplayNameSnapshot: "Release bot",
      },
      {
        ...baseTask,
        id: "task-retired",
        referenceNumber: 44,
        title: "Nightly sync",
        position: 1,
        assigneeKind: "agent",
        assigneeCredentialId: "credential-revoked",
        assigneeDisplayNameSnapshot: "Retired bot",
      },
    ]);
    epicServiceMock.listProjectEpics.mockResolvedValueOnce([]);
    actorServiceMock.loadProjectActorRegistryForActor.mockResolvedValueOnce({
      activeHumanIds: new Set<string>(),
      humanById: new Map(),
      credentialById: new Map([
        [
          "credential-active",
          {
            kind: "agent",
            id: "credential-active",
            displayName: "Release bot",
            usernameTag: null,
            avatarSeed: null,
            status: "active",
            isAssignable: true,
          },
        ],
      ]),
      assignable: [],
    });

    const element = await KanbanBoardSection({
      projectId: "project-1",
      actorUserId: "owner-1",
      canEdit: true,
      storageProvider: "local",
      collaborators: [],
    });
    const props = element.props as {
      initialTasks: KanbanTask[];
    };

    expect(props.initialTasks[0]?.assignee).toEqual({
      kind: "agent",
      id: "credential-active",
      displayName: "Release bot",
      usernameTag: null,
      avatarSeed: null,
      status: "active",
      isAssignable: true,
    });
    expect(props.initialTasks[1]?.assignee).toEqual({
      kind: "agent",
      id: "credential-revoked",
      displayName: "Retired bot",
      usernameTag: null,
      avatarSeed: null,
      status: "revoked",
      isAssignable: false,
    });
  });
});
