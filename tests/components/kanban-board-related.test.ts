import { describe, expect, test } from "vitest";

import { reconcileBilateralTaskRelations } from "@/components/kanban-board-related";
import type { KanbanTask } from "@/components/kanban-board-types";

const person = {
  id: "user-1",
  displayName: "Test User",
  usernameTag: null,
  avatarSeed: "user-1",
};

function createTask(
  id: string,
  title: string,
  relatedTasks: KanbanTask["relatedTasks"] = []
): KanbanTask {
  return {
    id,
    reference: "ND-1",
    title,
    description: null,
    deadlineDate: null,
    commentCount: 0,
    labels: [],
    blockedFollowUps: [],
    status: "Backlog",
    position: 0,
    archivedAt: null,
    attachments: [],
    relatedTasks,
    epic: null,
    assignee: null,
    createdBy: person,
    updatedBy: person,
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
  };
}

describe("reconcileBilateralTaskRelations", () => {
  test("adds the inverse relation to the other loaded task", () => {
    const taskB = createTask("task-b", "Task B");
    const updatedTaskA = createTask("task-a", "Task A", [
      {
        id: taskB.id,
        title: taskB.title,
        status: taskB.status,
        archivedAt: taskB.archivedAt,
      },
    ]);

    expect(reconcileBilateralTaskRelations(taskB, updatedTaskA).relatedTasks).toEqual([
      {
        id: "task-a",
        title: "Task A",
        status: "Backlog",
        archivedAt: null,
      },
    ]);
  });

  test("removes the inverse relation when the authoritative task unlinks it", () => {
    const taskB = createTask("task-b", "Task B", [
      {
        id: "task-a",
        title: "Task A",
        status: "Backlog",
        archivedAt: null,
      },
    ]);
    const updatedTaskA = createTask("task-a", "Task A");

    expect(reconcileBilateralTaskRelations(taskB, updatedTaskA).relatedTasks).toEqual([]);
  });

  test("deduplicates repeated updates and refreshes the inverse summary", () => {
    const taskB = createTask("task-b", "Task B", [
      {
        id: "task-a",
        title: "Old title",
        status: "Backlog",
        archivedAt: null,
      },
      {
        id: "task-a",
        title: "Old title",
        status: "Backlog",
        archivedAt: null,
      },
    ]);
    const updatedTaskA = {
      ...createTask("task-a", "Updated task A", [
        {
          id: "task-b",
          title: "Task B",
          status: "Backlog",
          archivedAt: null,
        },
      ]),
      status: "Done" as const,
      archivedAt: "2026-07-30T09:00:00.000Z",
    };

    const firstResult = reconcileBilateralTaskRelations(taskB, updatedTaskA);
    const repeatedResult = reconcileBilateralTaskRelations(firstResult, updatedTaskA);

    expect(repeatedResult.relatedTasks).toEqual([
      {
        id: "task-a",
        title: "Updated task A",
        status: "Done",
        archivedAt: "2026-07-30T09:00:00.000Z",
      },
    ]);
  });

  test("normalizes duplicate summaries on the authoritative task itself", () => {
    const updatedTaskA = createTask("task-a", "Task A", [
      {
        id: "task-b",
        title: "Task B",
        status: "Backlog",
        archivedAt: null,
      },
      {
        id: "task-b",
        title: "Task B",
        status: "Backlog",
        archivedAt: null,
      },
      {
        id: "task-a",
        title: "Task A",
        status: "Backlog",
        archivedAt: null,
      },
    ]);

    expect(
      reconcileBilateralTaskRelations(createTask("task-a", "Old Task A"), updatedTaskA)
        .relatedTasks
    ).toEqual([
      {
        id: "task-b",
        title: "Task B",
        status: "Backlog",
        archivedAt: null,
      },
    ]);
  });
});

