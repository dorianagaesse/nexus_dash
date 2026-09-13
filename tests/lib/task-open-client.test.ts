// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  TASK_OPEN_REQUEST_EVENT,
  requestTaskOpen,
  type TaskOpenRequestDetail,
} from "@/lib/task-open-client";

describe("task-open-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("dispatches the task id and reports unhandled when nobody claims it", () => {
    const listener = vi.fn();
    window.addEventListener(TASK_OPEN_REQUEST_EVENT, listener);

    expect(requestTaskOpen("task-1")).toBe(false);

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent<TaskOpenRequestDetail>)
      .detail;
    expect(detail.taskId).toBe("task-1");
    expect(detail.handled).toBe(false);

    window.removeEventListener(TASK_OPEN_REQUEST_EVENT, listener);
  });

  test("reports handled when a listener claims the request", () => {
    const listener = (event: Event) => {
      (event as CustomEvent<TaskOpenRequestDetail>).detail.markHandled();
    };
    window.addEventListener(TASK_OPEN_REQUEST_EVENT, listener);

    expect(requestTaskOpen("task-2")).toBe(true);

    window.removeEventListener(TASK_OPEN_REQUEST_EVENT, listener);
  });

  test("ignores empty task ids without dispatching", () => {
    const listener = vi.fn();
    window.addEventListener(TASK_OPEN_REQUEST_EVENT, listener);

    expect(requestTaskOpen("")).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(TASK_OPEN_REQUEST_EVENT, listener);
  });
});
