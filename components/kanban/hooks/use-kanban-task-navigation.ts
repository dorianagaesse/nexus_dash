"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { KanbanTask, TaskMutationResponseTask } from "@/components/kanban-board-types";
import { TASK_OPEN_REQUEST_EVENT, type TaskOpenRequestDetail } from "@/lib/task-open-client";
import { isTaskStatus } from "@/lib/task-status";

/** Owns deep links, browser history and stale fallback-fetch cancellation. */
export function useKanbanTaskNavigation({
  projectId,
  initialTaskId,
  taskById,
  taskOpenRequestRef,
  handleSelectTask,
  closeTaskModal,
  upsertRemoteTask,
  setIsExpanded,
  mapTaskMutationResponseTask,
}: {
  projectId: string;
  initialTaskId?: string | null;
  taskById: ReadonlyMap<string, KanbanTask>;
  taskOpenRequestRef: RefObject<number>;
  handleSelectTask: (task: KanbanTask) => void;
  closeTaskModal: () => void;
  upsertRemoteTask: (task: KanbanTask) => void;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  mapTaskMutationResponseTask: (task: TaskMutationResponseTask) => KanbanTask;
}) {
  const openedInitialTaskIdRef = useRef<string | null>(null);
  const openTaskById = useCallback(
    (rawTaskId: string) => {
      const requestId = ++taskOpenRequestRef.current;
      const taskId = rawTaskId.trim();
      if (!taskId) {
        return;
      }

      const task = taskById.get(taskId);
      if (task) {
        handleSelectTask(task);
        setIsExpanded(true);
        return;
      }

      // The task is absent from the loaded board; fetch it by id so the
      // detail modal can still open. Failures keep the board unchanged.
      void (async () => {
        try {
          const response = await fetch(
            `/api/projects/${projectId}/tasks/${encodeURIComponent(taskId)}`
          );
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as {
            task?: TaskMutationResponseTask;
          };
          const remoteTask = payload.task;
          if (
            requestId !== taskOpenRequestRef.current ||
            !remoteTask ||
            !isTaskStatus(remoteTask.status)
          ) {
            return;
          }
          const mappedTask = mapTaskMutationResponseTask(remoteTask);
          upsertRemoteTask(mappedTask);
          handleSelectTask(mappedTask);
          setIsExpanded(true);
        } catch (error) {
          console.error("[KanbanBoard.openTaskById]", error);
        }
      })();
    },
    [handleSelectTask, projectId, setIsExpanded, taskById, upsertRemoteTask, taskOpenRequestRef, mapTaskMutationResponseTask]
  );

  const normalizedInitialTaskId =
    typeof initialTaskId === "string" ? initialTaskId.trim() : "";

  useEffect(() => {
    if (
      !normalizedInitialTaskId ||
      openedInitialTaskIdRef.current === normalizedInitialTaskId
    ) {
      return;
    }

    openedInitialTaskIdRef.current = normalizedInitialTaskId;
    openTaskById(normalizedInitialTaskId);
  }, [normalizedInitialTaskId, openTaskById]);

  useEffect(() => {
    const followHistory = () => {
      const taskId = new URL(window.location.href).searchParams.get("taskId");
      if (taskId) {
        openTaskById(taskId);
      } else {
        closeTaskModal();
      }
    };
    window.addEventListener("popstate", followHistory);
    return () => window.removeEventListener("popstate", followHistory);
  }, [closeTaskModal, openTaskById]);

  useEffect(() => {
    const handleTaskOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<TaskOpenRequestDetail>).detail;
      if (!detail?.taskId) {
        return;
      }

      detail.markHandled();
      openTaskById(detail.taskId);
    };

    window.addEventListener(TASK_OPEN_REQUEST_EVENT, handleTaskOpenRequest);

    return () => {
      window.removeEventListener(TASK_OPEN_REQUEST_EVENT, handleTaskOpenRequest);
    };
  }, [openTaskById]);

}
