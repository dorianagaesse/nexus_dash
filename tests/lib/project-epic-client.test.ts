// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { doesTaskMutationAffectProjectEpics } from "@/lib/project-epic-client";

const baseTask = {
  id: "task-1",
  title: "Ship launch plan",
  status: "Backlog",
  position: 0,
  archivedAt: null,
  epic: { id: "epic-1", name: "Launch" },
};

describe("project epic client reconciliation", () => {
  test("detects create, link, unlink, and reassignment mutations", () => {
    expect(doesTaskMutationAffectProjectEpics(null, baseTask)).toBe(true);
    expect(
      doesTaskMutationAffectProjectEpics({ ...baseTask, epic: null }, baseTask)
    ).toBe(true);
    expect(doesTaskMutationAffectProjectEpics(baseTask, null)).toBe(true);
    expect(
      doesTaskMutationAffectProjectEpics(baseTask, {
        ...baseTask,
        epic: { id: "epic-2", name: "Follow-up" },
      })
    ).toBe(true);
  });

  test("detects Epic-visible task changes and ignores unrelated tasks", () => {
    expect(
      doesTaskMutationAffectProjectEpics(baseTask, {
        ...baseTask,
        status: "Done",
      })
    ).toBe(true);
    expect(
      doesTaskMutationAffectProjectEpics(baseTask, {
        ...baseTask,
        title: "Ship revised launch plan",
      })
    ).toBe(true);
    expect(
      doesTaskMutationAffectProjectEpics(baseTask, {
        ...baseTask,
        position: 1,
      })
    ).toBe(true);
    expect(doesTaskMutationAffectProjectEpics(baseTask, baseTask)).toBe(false);
    expect(
      doesTaskMutationAffectProjectEpics(
        { ...baseTask, epic: null },
        { ...baseTask, epic: null, title: "Unrelated edit" }
      )
    ).toBe(false);
  });
});
