"use client";

export const TASK_OPEN_REQUEST_EVENT = "nexusdash:task-open-request";

/** Keep task navigation in browser history without reloading the project. */
export function synchronizeTaskUrl(taskId: string | null): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("taskId") === taskId) {
    return;
  }

  if (taskId) {
    url.searchParams.set("taskId", taskId);
  } else {
    url.searchParams.delete("taskId");
  }
  const state = { ...window.history.state };
  // Next skips its URL/search-param synchronization for internal router writes.
  // Let its patched pushState handle this external update and restore its flags.
  delete state.__NA;
  delete state._N;
  window.history.pushState(state, "", url);
}

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
