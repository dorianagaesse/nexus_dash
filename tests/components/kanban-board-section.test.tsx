import { describe, expect, test, vi } from "vitest";

const projectServiceMock = vi.hoisted(() => ({
  listProjectKanbanTasks: vi.fn(),
}));

const epicServiceMock = vi.hoisted(() => ({
  listProjectEpics: vi.fn(),
}));

vi.mock("@/lib/services/project-service", () => ({
  listProjectKanbanTasks: projectServiceMock.listProjectKanbanTasks,
}));

vi.mock("@/lib/services/project-epic-service", () => ({
  listProjectEpics: epicServiceMock.listProjectEpics,
}));

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

    const element = await KanbanBoardSection({
      projectId: "project-1",
      actorUserId: "owner-1",
      canEdit: true,
      storageProvider: "local",
      collaborators: [],
    });
    const props = element.props as { initialTasks: KanbanTask[] };

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
});
