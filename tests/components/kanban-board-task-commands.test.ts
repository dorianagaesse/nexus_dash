import { describe, expect, test } from "vitest";

import {
  buildTaskCommandPayload,
  remainingTaskCommands,
} from "@/components/kanban-board-task-commands";
import type {
  KanbanTask,
  TaskAuthor,
  TaskRelatedSummary,
} from "@/components/kanban-board-types";
import type { ProjectActorSummary } from "@/lib/project-actor";

function actor(
  kind: ProjectActorSummary["kind"],
  id: string
): ProjectActorSummary {
  return {
    kind,
    id,
    displayName: id,
    usernameTag: null,
    avatarSeed: null,
    status: "active",
    isAssignable: true,
  };
}

const OWNER = actor("human", "user-1");
const EDITOR = actor("human", "user-2");
const AGENT = actor("agent", "agent-1");

const AUTHOR: TaskAuthor = {
  id: "user-1",
  displayName: "Owner",
  usernameTag: null,
  avatarSeed: "seed-owner",
};

function relatedTask(id: string): TaskRelatedSummary {
  return { id, title: id, status: "Backlog", archivedAt: null };
}

function createTask(
  overrides: Partial<KanbanTask> = {}
): KanbanTask {
  return {
    id: "task-a",
    reference: "ND-1",
    contentRevision: 1,
    title: "Task A",
    description: null,
    deadlineDate: null,
    commentCount: 0,
    labels: [],
    blockedFollowUps: [],
    status: "Backlog",
    position: 0,
    archivedAt: null,
    attachments: [],
    relatedTasks: [],
    epic: null,
    assignee: null,
    createdBy: AUTHOR,
    updatedBy: AUTHOR,
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
    ...overrides,
  };
}

describe("buildTaskCommandPayload", () => {
  test("returns no commands when the draft matches its starting base", () => {
    const task = createTask({ assignee: OWNER, relatedTasks: [relatedTask("b")] });
    expect(
      buildTaskCommandPayload(task, OWNER, [relatedTask("b")], "")
    ).toEqual({});
  });

  test("treats relation order as insignificant", () => {
    const task = createTask({ relatedTasks: [relatedTask("b"), relatedTask("c")] });
    expect(
      buildTaskCommandPayload(task, null, [relatedTask("c"), relatedTask("b")], "")
    ).toEqual({});
  });

  test("emits assignment, relation, and follow-up commands from the draft", () => {
    const task = createTask({ assignee: OWNER, relatedTasks: [relatedTask("b")] });
    expect(
      buildTaskCommandPayload(task, AGENT, [relatedTask("b"), relatedTask("c")], "  Next step  ")
    ).toEqual({
      assignee: AGENT,
      relatedTaskIds: ["b", "c"],
      blockedFollowUpEntry: "Next step",
    });
  });
});

describe("remainingTaskCommands", () => {
  test("keeps a locally changed assignment pending until the acceptance reflects it", () => {
    const startingBase = createTask({ assignee: OWNER });
    expect(
      remainingTaskCommands(startingBase, createTask({ assignee: OWNER }), EDITOR, [], "")
    ).toEqual({ assignee: EDITOR });
    expect(
      remainingTaskCommands(startingBase, createTask({ assignee: EDITOR }), EDITOR, [], "")
    ).toEqual({});
  });

  test("does not resurrect a remote-only command change as a pending local edit", () => {
    const startingBase = createTask({ assignee: OWNER });
    const remoteAccepted = createTask({ assignee: EDITOR });
    // The draft still shows the starting value because this client never
    // touched it; the server moving the record is not a pending command.
    expect(
      remainingTaskCommands(startingBase, remoteAccepted, OWNER, [], "")
    ).toEqual({});
  });

  test("keeps relation changes pending until the accepted task contains them", () => {
    const startingBase = createTask({ relatedTasks: [relatedTask("b")] });
    const draftRelations = [relatedTask("b"), relatedTask("c")];
    expect(
      remainingTaskCommands(
        startingBase,
        createTask({ relatedTasks: [relatedTask("b")] }),
        null,
        draftRelations,
        ""
      )
    ).toEqual({ relatedTaskIds: ["b", "c"] });
    expect(
      remainingTaskCommands(
        startingBase,
        createTask({ relatedTasks: [relatedTask("c"), relatedTask("b")] }),
        null,
        draftRelations,
        ""
      )
    ).toEqual({});
  });

  test("keeps a typed follow-up entry pending and clears it when it is not part of the draft", () => {
    const task = createTask();
    expect(remainingTaskCommands(task, task, null, [], "Next step")).toEqual({
      blockedFollowUpEntry: "Next step",
    });
    expect(remainingTaskCommands(task, task, null, [], "")).toEqual({});
  });
});
