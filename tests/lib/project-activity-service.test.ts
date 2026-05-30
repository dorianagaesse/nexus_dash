import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { touchProjectActivity } from "@/lib/services/project-activity-service";

describe("project-activity-service", () => {
  test("touchProjectActivity advances the project updatedAt marker", async () => {
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");
    const projectUpdate = vi.fn().mockResolvedValue({ id: "project-1" });

    const result = await touchProjectActivity({
      db: {
        project: {
          update: projectUpdate,
        },
      } as never,
      projectId: " project-1 ",
      occurredAt,
    });

    expect(result).toBe(occurredAt);
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { updatedAt: occurredAt },
      select: { id: true },
    });
  });

  test("touchProjectActivity ignores empty project identifiers", async () => {
    const projectUpdate = vi.fn();
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");

    const result = await touchProjectActivity({
      db: {
        project: {
          update: projectUpdate,
        },
      } as never,
      projectId: " ",
      occurredAt,
    });

    expect(result).toBe(occurredAt);
    expect(projectUpdate).not.toHaveBeenCalled();
  });
});
