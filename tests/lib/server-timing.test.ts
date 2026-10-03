import { beforeEach, describe, expect, test, vi } from "vitest";

const metricsMock = vi.hoisted(() => ({
  recordServiceTiming: vi.fn(),
}));

vi.mock("@/lib/observability/realtime-metrics", () => ({
  recordServiceTiming: metricsMock.recordServiceTiming,
}));

import { startServerTiming } from "@/lib/observability/server-timing";

describe("startServerTiming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns Server-Timing headers with a sanitized metric name", () => {
    const timing = startServerTiming("task.status");

    const headers = timing.headers() as Record<string, string>;

    expect(headers["Server-Timing"]).toMatch(/^task-status;dur=\d+\.\d$/);
    expect(headers["x-nexusdash-server-timing"]).toBe(headers["Server-Timing"]);
  });

  test("records one timing sample per request with the raw metric name", () => {
    const timing = startServerTiming("project.activity.poll");

    const firstHeaders = timing.headers() as Record<string, string>;
    const secondHeaders = timing.headers() as Record<string, string>;

    expect(secondHeaders["Server-Timing"]).toBe(firstHeaders["Server-Timing"]);
    expect(metricsMock.recordServiceTiming).toHaveBeenCalledTimes(1);
    expect(metricsMock.recordServiceTiming).toHaveBeenCalledWith(
      "project.activity.poll",
      expect.any(Number)
    );
  });

  test("does not record when the timing is never read", () => {
    startServerTiming("task.update");

    expect(metricsMock.recordServiceTiming).not.toHaveBeenCalled();
  });
});
