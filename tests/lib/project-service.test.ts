import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getProjectDashboardById } from "@/lib/services/project-service";

describe("project-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("archives stale done tasks before loading dashboard", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.task.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValueOnce({ id: "project-1" });

    const result = await getProjectDashboardById("project-1");

    expect(result).toEqual({ id: "project-1" });
    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).toHaveBeenCalledTimes(1);

    const updateManyCall = prismaMock.task.updateMany.mock.calls[0][0];
    expect(updateManyCall.where).toMatchObject({
      projectId: "project-1",
      status: "Done",
      archivedAt: null,
    });
    expect(updateManyCall.where.OR).toHaveLength(2);
    expect(updateManyCall.where.OR[0].completedAt.lte).toBeInstanceOf(Date);
    expect(updateManyCall.where.OR[1].updatedAt.lte).toBeInstanceOf(Date);
    expect(updateManyCall.data).toEqual({ archivedAt: expect.any(Date) });
  });

  test("skips archive write when no stale done task exists", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(null);
    prismaMock.project.findUnique.mockResolvedValueOnce({ id: "project-1" });

    await getProjectDashboardById("project-1");

    expect(prismaMock.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).toHaveBeenCalledTimes(1);
  });
});
