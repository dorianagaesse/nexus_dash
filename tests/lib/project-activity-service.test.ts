import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import {
  recordProjectActivityEvent,
  touchProjectActivity,
} from "@/lib/services/project-activity-service";

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

  test("recordProjectActivityEvent creates a typed event and advances project activity", async () => {
    const occurredAt = new Date("2026-05-30T10:00:00.000Z");
    const projectUpdate = vi.fn().mockResolvedValue({ id: "project-1" });
    const eventCreate = vi.fn().mockResolvedValue({
      id: "event-1",
      projectId: "project-1",
      actorUserId: "user-1",
      domain: "task",
      action: "created",
      entityId: "task-1",
      version: occurredAt,
      payload: { taskId: "task-1" },
      createdAt: occurredAt,
    });

    const result = await recordProjectActivityEvent({
      db: {
        project: {
          update: projectUpdate,
        },
        projectActivityEvent: {
          create: eventCreate,
        },
      } as never,
      projectId: " project-1 ",
      actorUserId: " user-1 ",
      domain: "task",
      action: "created",
      entityId: " task-1 ",
      payload: { taskId: "task-1" },
      occurredAt,
    });

    expect(result?.id).toBe("event-1");
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { updatedAt: occurredAt },
      select: { id: true },
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        actorUserId: "user-1",
        domain: "task",
        action: "created",
        entityId: "task-1",
        version: occurredAt,
        payload: { taskId: "task-1" },
      },
      select: expect.objectContaining({
        id: true,
        projectId: true,
        version: true,
      }),
    });
  });
});
