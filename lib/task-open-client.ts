"use client";

export const TASK_OPEN_REQUEST_EVENT = "nexusdash:task-open-request";

export interface TaskOpenRequestDetail {
  taskId: string;
  handled: boolean;
  markHandled: () => void;
}

export function requestTaskOpen(taskId: string): boolean {
  if (typeof window === "undefined" || !taskId) {
    return false;
  }

  const detail: TaskOpenRequestDetail = {
    taskId,
    handled: false,
    markHandled() {
      detail.handled = true;
    },
  };

  window.dispatchEvent(
    new CustomEvent<TaskOpenRequestDetail>(TASK_OPEN_REQUEST_EVENT, {
      detail,
    })
  );

  return detail.handled;
}
