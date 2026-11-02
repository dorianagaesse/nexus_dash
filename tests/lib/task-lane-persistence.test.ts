import { describe, expect, test, vi } from "vitest";
import type { DbClient } from "@/lib/services/rls-context";
import { shiftTaskLanePositions } from "@/lib/services/tasks/task-persistence";

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
});
