import { describe, expect, test, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  logServerWarning: vi.fn(),
}));

const serviceMock = vi.hoisted(() => ({
  recordProjectActivityEventAsActor: vi.fn(),
  touchProjectActivityAsActor: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: loggerMock.logServerWarning,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  recordProjectActivityEventAsActor: serviceMock.recordProjectActivityEventAsActor,
  touchProjectActivityAsActor: serviceMock.touchProjectActivityAsActor,
}));

import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";

describe("recordProjectActivityEventVersion", () => {
  test("falls back to a durable activity touch when typed event recording fails", async () => {
    const fallbackVersion = new Date("2026-05-30T10:00:00.000Z");
    serviceMock.recordProjectActivityEventAsActor.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "event-write-failed",
    });
    serviceMock.touchProjectActivityAsActor.mockResolvedValueOnce({
      ok: true,
      data: { version: fallbackVersion },
    });

    const result = await recordProjectActivityEventVersion({
      actorUserId: "user-1",
      projectId: "project-1",
      domain: "task",
      action: "created",
      entityId: "task-1",
      payload: { taskId: "task-1" },
    });

    expect(result).toBe(fallbackVersion);
    expect(serviceMock.touchProjectActivityAsActor).toHaveBeenCalledWith({
      actorUserId: "user-1",
      projectId: "project-1",
    });
  });
});
