// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import {
  doesTaskMutationAffectProjectEpics,
  getLatestProjectEpicSnapshot,
  reconcileProjectEpicsAfterTaskMutation,
} from "@/lib/project-epic-client";

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

  test("does not publish an older response after a newer request wins", async () => {
    const projectId = "project-overlapping-reconciliation";
    let resolveOlderJson: ((value: unknown) => void) | undefined;
    const olderJson = new Promise((resolve) => {
      resolveOlderJson = resolve;
    });
    const olderEpic = {
      id: "epic-1",
      name: "Older snapshot",
      description: "",
      status: "Ready" as const,
      progressPercent: 0,
      taskCount: 0,
      completedTaskCount: 0,
      linkedTasks: [],
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T00:00:00.000Z",
    };
    const newerEpic = { ...olderEpic, name: "Newer snapshot" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => olderJson })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ epics: [newerEpic] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const olderRequest = reconcileProjectEpicsAfterTaskMutation(
      projectId,
      null,
      baseTask
    );
    await Promise.resolve();
    const newerRequest = reconcileProjectEpicsAfterTaskMutation(
      projectId,
      null,
      baseTask
    );

    await expect(newerRequest).resolves.toBe(true);
    resolveOlderJson?.({ epics: [olderEpic] });
    await expect(olderRequest).resolves.toBe(false);
    expect(getLatestProjectEpicSnapshot(projectId)).toEqual([newerEpic]);

    vi.unstubAllGlobals();
  });
});
