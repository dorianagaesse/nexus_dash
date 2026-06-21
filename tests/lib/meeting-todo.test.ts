import { describe, expect, test } from "vitest";

import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { buildProjectMeetingTodos } from "@/lib/meeting-todo";

const REFERENCE_NOW = new Date("2026-06-21T12:00:00.000Z").getTime();

function meetingNote(
  overrides: Partial<ProjectMeetingNotePanelNote> = {}
): ProjectMeetingNotePanelNote {
  return {
    id: "note-1",
    projectId: "project-1",
    title: "Weekly review",
    scheduledAt: "2026-06-10T12:00:00.000Z",
    participants: [],
    labels: ["sync"],
    status: "actions_in_progress",
    inputNotes: "",
    outputNotes: "",
    actions: [
      {
        id: "action-1",
        content: "Send recap",
        completedAt: null,
        position: 0,
      },
    ],
    createdAt: "2026-06-10T11:00:00.000Z",
    updatedAt: "2026-06-10T13:00:00.000Z",
    ...overrides,
  };
}

describe("meeting todo aggregation", () => {
  test("sorts overdue open todos before newer follow-ups", () => {
    const result = buildProjectMeetingTodos(
      [
        meetingNote(),
        meetingNote({
          id: "note-2",
          scheduledAt: "2026-06-20T12:00:00.000Z",
          actions: [
            {
              id: "action-2",
              content: "Prepare agenda",
              completedAt: null,
              position: 0,
            },
          ],
        }),
      ],
      REFERENCE_NOW
    );

    expect(result.open.map((todo) => todo.action.id)).toEqual([
      "action-1",
      "action-2",
    ]);
    expect(result.open.map((todo) => todo.isOverdue)).toEqual([true, false]);
  });

  test("keeps completed todos available for reopening in newest-first order", () => {
    const result = buildProjectMeetingTodos(
      [
        meetingNote({
          actions: [
            {
              id: "action-1",
              content: "Send recap",
              completedAt: "2026-06-20T12:00:00.000Z",
              position: 0,
            },
            {
              id: "action-2",
              content: "Update roadmap",
              completedAt: "2026-06-21T10:00:00.000Z",
              position: 1,
            },
          ],
        }),
      ],
      REFERENCE_NOW
    );

    expect(result.open).toEqual([]);
    expect(result.completed.map((todo) => todo.action.id)).toEqual([
      "action-2",
      "action-1",
    ]);
  });

  test("does not mark todos in archived meeting notes overdue", () => {
    const result = buildProjectMeetingTodos(
      [meetingNote({ status: "done" })],
      REFERENCE_NOW
    );

    expect(result.open[0]?.isOverdue).toBe(false);
  });
});
