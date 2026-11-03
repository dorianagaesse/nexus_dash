import { describe, expect, test, vi } from "vitest";
import type { DbClient } from "@/lib/services/rls-context";
import { compactTaskSourceLane, shiftTaskLanePositions } from "@/lib/services/tasks/task-persistence";

describe("Task lane persistence", () => {
  test("awaits each same-lane write in the established collision-safe order", async () => {
    const completed: string[] = [];
    const update = vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id === "last") await Promise.resolve();
      completed.push(where.id);
    });
    const db = { task: { update } } as unknown as DbClient;

    await shiftTaskLanePositions(db, {
      projectId: "project", sourceStatus: "Backlog", sourcePosition: 0,
      targetStatus: "Backlog", targetPosition: 2,
      destinationTasks: [{ id: "middle", position: 1 }, { id: "last", position: 2 }],
    });

    expect(completed).toEqual(["last", "middle"]);
    expect(update.mock.calls.map(([input]) => input.where.id)).toEqual(completed);
  });

  test("opens destination space through the supplied project-scoped client", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = { task: { updateMany } } as unknown as DbClient;

    await shiftTaskLanePositions(db, {
      projectId: "project", sourceStatus: "Backlog", sourcePosition: 0,
      targetStatus: "In Progress", targetPosition: 1,
      destinationTasks: [{ id: "existing", position: 1 }],
    });

    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { projectId: "project", status: "In Progress", position: { gte: 1 } },
      data: { position: { increment: 1 } },
    });
  });

  test("moves a card upward without changing cards outside the crossed range", async () => {
    const positions = new Map([["before", 0], ["first", 1], ["second", 2], ["after", 4]]);
    const completed: string[] = [];
    const update = vi.fn(async ({ where, data }: { where: { id: string }; data: { position: number } }) => {
      await Promise.resolve();
      positions.set(where.id, data.position);
      completed.push(where.id);
    });
    const db = { task: { update } } as unknown as DbClient;

    await shiftTaskLanePositions(db, {
      projectId: "project", sourceStatus: "Backlog", sourcePosition: 3,
      targetStatus: "Backlog", targetPosition: 1,
      destinationTasks: [...positions].map(([id, position]) => ({ id, position })),
    });

    expect(completed).toEqual(["first", "second"]);
    expect([...positions]).toEqual([["before", 0], ["first", 2], ["second", 3], ["after", 4]]);
  });

  test("closes only the source-lane gap within the caller's project", async () => {
    const rows = [
      { projectId: "project", status: "Backlog", position: 0 },
      { projectId: "project", status: "Backlog", position: 2 },
      { projectId: "project", status: "Backlog", position: 3 },
      { projectId: "other", status: "Backlog", position: 2 },
      { projectId: "project", status: "Done", position: 2 },
    ];
    const db = { task: { updateMany: vi.fn(async ({ where, data }: {
      where: { projectId: string; status: string; position: { gt: number } };
      data: { position: { decrement: number } };
    }) => {
      for (const row of rows) {
        if (row.projectId === where.projectId && row.status === where.status && row.position > where.position.gt) {
          row.position -= data.position.decrement;
        }
      }
    }) } } as unknown as DbClient;

    await compactTaskSourceLane(db, "project", "Backlog", 1);

    expect(rows.map(row => row.position)).toEqual([0, 1, 2, 2, 2]);
  });
});
