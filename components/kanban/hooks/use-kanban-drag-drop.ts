"use client";

import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DraggableLocation, DropResult } from "@hello-pangea/dnd";
import type { KanbanTask, TaskPersonSummary } from "@/components/kanban-board-types";
import {
  buildPersistPayload,
  cloneColumns,
  createEmptyColumns,
  stampTaskActivity,
  type TaskColumns,
} from "@/components/kanban-board-utils";
import { applyFilteredTaskDrop } from "@/components/kanban/kanban-filter-utils";
import { fetchProjectActivityMutation } from "@/lib/project-activity-client";
import { isProjectActivityVersionNewer, readProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { reconcileProjectEpicsAfterTaskMutation } from "@/lib/project-epic-client";
import { isTaskStatus, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import type { KanbanBoardState } from "./use-kanban-board-state";

interface DropApplication {
  previousColumns: TaskColumns<KanbanTask>;
  nextColumns: TaskColumns<KanbanTask>;
  movedTask: KanbanTask;
  sourceStatus: TaskStatus;
  destinationStatus: TaskStatus;
  previousTask: KanbanTask;
  nextTask: KanbanTask;
}

interface KeyboardDropIntent {
  source: DraggableLocation;
  destination: DraggableLocation;
  movedTaskId: string;
  outcome: "pending" | "saved" | "failed";
  // Project activity version reported by the early persist response; a remote
  // full-order delivery with a newer version is authoritative over the intent.
  writeVersion: string | null;
  // Newest authoritative version already applied when the intent was submitted;
  // used as the baseline until the write's own version is known.
  intentStartVersion: string | null;
  // Number of remote task representations applied when the intent was
  // submitted; only later representations can carry newer lane authority.
  intentStartTaskSeq: number;
  // Lane membership and orders the write payload persists; restored around
  // the settle so the board shows the stored layout without re-deriving the
  // move by index.
  committedOrders: Array<{ status: TaskStatus; taskIds: string[] }>;
  settled: boolean;
}

// Restores the committed payload's lane membership and lane order around a
// keyboard settle. The payload captured every lane at write time, so tasks
// that moved between lanes during the intent are placed in their committed
// lane with the matching status; partial deltas that landed afterwards (task
// creations) keep their current positions and deleted tasks are never
// resurrected, mirroring how the server replays those events over the stored
// order. A newer remote representation of a single task (task upserts carry
// its current status) outranks the payload's captured membership for that
// task, so its newer lane is kept even though the payload still lists it in
// the lane it occupied at write time.
function reconcileCommittedColumns(
  previousColumns: TaskColumns<KanbanTask>,
  orders: Array<{ status: TaskStatus; taskIds: string[] }>,
  preservedStatusByTaskId: ReadonlyMap<string, TaskStatus>
): TaskColumns<KanbanTask> {
  const taskById = new Map<string, KanbanTask>();
  const currentStatusByTaskId = new Map<string, TaskStatus>();
  TASK_STATUSES.forEach((status) => {
    previousColumns[status].forEach((task) => {
      taskById.set(task.id, task);
      currentStatusByTaskId.set(task.id, status);
    });
  });

  const committedStatusByTaskId = new Map<string, TaskStatus>();
  orders.forEach((order) => {
    order.taskIds.forEach((taskId) => {
      committedStatusByTaskId.set(taskId, order.status);
    });
  });

  const targetStatusByTaskId = new Map<string, TaskStatus>();
  taskById.forEach((_task, taskId) => {
    targetStatusByTaskId.set(
      taskId,
      preservedStatusByTaskId.get(taskId) ??
        committedStatusByTaskId.get(taskId) ??
        (currentStatusByTaskId.get(taskId) as TaskStatus)
    );
  });

  const preservedIdsByStatus = createEmptyColumns<string>();
  preservedStatusByTaskId.forEach((status, taskId) => {
    if (taskById.has(taskId)) {
      preservedIdsByStatus[status].push(taskId);
    }
  });

  const placedTaskIds = new Set<string>();
  const nextColumns = createEmptyColumns<KanbanTask>();
  let hasChanges = false;

  TASK_STATUSES.forEach((status) => {
    const committedIds =
      orders.find((order) => order.status === status)?.taskIds ?? [];
    const merged = committedIds.flatMap((taskId) => {
      const task = taskById.get(taskId);
      if (
        !task ||
        placedTaskIds.has(taskId) ||
        targetStatusByTaskId.get(taskId) !== status
      ) {
        return [];
      }
      placedTaskIds.add(taskId);
      return [task.status === status ? task : { ...task, status }];
    });

    preservedIdsByStatus[status].forEach((taskId) => {
      if (placedTaskIds.has(taskId)) {
        return;
      }
      placedTaskIds.add(taskId);
      const task = taskById.get(taskId) as KanbanTask;
      const stamped = task.status === status ? task : { ...task, status };
      const currentIndex = previousColumns[status].findIndex(
        (currentTask) => currentTask.id === taskId
      );
      if (currentIndex === -1) {
        merged.push(stamped);
      } else {
        merged.splice(Math.min(currentIndex, merged.length), 0, stamped);
      }
    });

    previousColumns[status].forEach((task, index) => {
      if (committedStatusByTaskId.has(task.id) || placedTaskIds.has(task.id)) {
        return;
      }
      merged.splice(Math.min(index, merged.length), 0, task);
    });

    const unchanged =
      merged.length === previousColumns[status].length &&
      merged.every((task, index) => task === previousColumns[status][index]);
    nextColumns[status] = unchanged ? previousColumns[status] : merged;
    hasChanges = hasChanges || !unchanged;
  });

  return hasChanges ? nextColumns : previousColumns;
}

/** Owns drag intent, persistence, rollback and version-fenced keyboard settlement. */
export function useKanbanDragDrop({
  canEdit,
  projectId,
  board,
  visibleColumns,
  currentActorSummary,
  relatedTaskGraph,
  syncRelatedTaskSummary,
  setPersistError,
}: {
  canEdit: boolean;
  projectId: string;
  board: KanbanBoardState;
  visibleColumns: TaskColumns<KanbanTask>;
  currentActorSummary: TaskPersonSummary | null;
  relatedTaskGraph: ReadonlyMap<string, readonly string[]>;
  syncRelatedTaskSummary: (taskId: string, summary: { title: string; status: TaskStatus; archivedAt: string | null }) => void;
  setPersistError: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    columns,
    setColumns,
    remoteColumnsVersionRef,
    remoteColumnsApplyCountRef,
    remoteTaskRepresentationsRef,
    remoteTaskRepresentationSeqRef,
  } = board;
  const keyboardDropIntentRef = useRef<KeyboardDropIntent | null>(null);
  const persistColumns = useCallback(
    async (
      nextColumns: TaskColumns<KanbanTask>,
      previousColumns: TaskColumns<KanbanTask>,
      epicTaskMutation?: {
        previousTask: KanbanTask;
        nextTask: KanbanTask;
      }
    ): Promise<{ persisted: boolean; version: string | null }> => {
      const remoteAppliesAtStart = remoteColumnsApplyCountRef.current;
      try {
        const response = await fetchProjectActivityMutation(
          projectId,
          `/api/projects/${projectId}/tasks/reorder`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildPersistPayload(nextColumns)),
          }
        );

        if (!response.ok) {
          throw new Error("Persist request failed");
        }

        setPersistError(null);
        if (epicTaskMutation) {
          void reconcileProjectEpicsAfterTaskMutation(
            projectId,
            epicTaskMutation.previousTask,
            epicTaskMutation.nextTask
          );
        }
        return {
          persisted: true,
          version: readProjectActivityVersionHeader(response),
        };
      } catch (error) {
        console.error("[KanbanBoard.persistColumns]", error);
        if (remoteColumnsApplyCountRef.current === remoteAppliesAtStart) {
          setColumns(previousColumns);
          setPersistError("Could not save task movement. Board reverted.");
        } else {
          // A remote order landed after this write started, so the captured
          // columns no longer match any stored order; keep the remote layout
          // instead of reverting over it.
          setPersistError("Could not save task movement.");
        }
        return { persisted: false, version: null };
      }
    },
    [projectId, remoteColumnsApplyCountRef, setColumns, setPersistError]
  );

  const computeDropApplication = useCallback(
    (
      source: DraggableLocation,
      destination: DraggableLocation
    ): { application: DropApplication } | { error: string } | null => {
      const sourceStatus = source.droppableId;
      const destinationStatus = destination.droppableId;

      if (!isTaskStatus(sourceStatus) || !isTaskStatus(destinationStatus)) {
        return { error: "Invalid drag target. Please retry." };
      }

      const previousColumns = cloneColumns(columns);
      const appliedDrop = applyFilteredTaskDrop({
        columns,
        visibleColumns,
        source: {
          status: sourceStatus,
          index: source.index,
        },
        destination: {
          status: destinationStatus,
          index: destination.index,
        },
        mapMovedTask: (task, nextStatus) =>
          stampTaskActivity(
            {
              ...task,
              status: nextStatus,
            },
            currentActorSummary
          ),
      });

      if (!appliedDrop) {
        return null;
      }

      const { columns: nextColumns, movedTask } = appliedDrop;
      const previousTaskIndex = previousColumns[sourceStatus].findIndex(
        (task) => task.id === movedTask.id
      );
      const nextTaskIndex = nextColumns[destinationStatus].findIndex(
        (task) => task.id === movedTask.id
      );
      const previousTask = previousColumns[sourceStatus][previousTaskIndex];
      const nextTask = nextColumns[destinationStatus][nextTaskIndex];

      if (!previousTask || !nextTask) {
        return { error: "Could not map task movement. Please retry." };
      }

      return {
        application: {
          previousColumns,
          nextColumns,
          movedTask,
          sourceStatus,
          destinationStatus,
          previousTask: {
            ...previousTask,
            status: sourceStatus,
            position: previousTaskIndex,
          },
          nextTask: {
            ...nextTask,
            status: destinationStatus,
            position: nextTaskIndex,
          },
        },
      };
    },
    [columns, currentActorSummary, visibleColumns]
  );

  const applyCommittedOrders = useCallback(
    (
      orders: Array<{ status: TaskStatus; taskIds: string[] }>,
      baselineVersion: string | null,
      minTaskSeq: number
    ) => {
      const preservedStatusByTaskId = new Map<string, TaskStatus>();
      remoteTaskRepresentationsRef.current.forEach((representation, taskId) => {
        if (representation.seq <= minTaskSeq) {
          return;
        }
        if (
          baselineVersion !== null &&
          !isProjectActivityVersionNewer(representation.version, baselineVersion)
        ) {
          return;
        }
        preservedStatusByTaskId.set(taskId, representation.status);
      });
      setColumns((previousColumns) =>
        reconcileCommittedColumns(
          previousColumns,
          orders,
          preservedStatusByTaskId
        )
      );
    },
    [remoteTaskRepresentationsRef, setColumns]
  );

  const handleKeyboardDropIntent = useCallback(
    (source: DraggableLocation, destination: DraggableLocation) => {
      if (!canEdit || keyboardDropIntentRef.current) {
        return;
      }

      const computed = computeDropApplication(source, destination);
      if (!computed || "error" in computed) {
        return;
      }

      const record: KeyboardDropIntent = {
        source,
        destination,
        movedTaskId: computed.application.movedTask.id,
        outcome: "pending",
        writeVersion: null,
        intentStartVersion: remoteColumnsVersionRef.current,
        intentStartTaskSeq: remoteTaskRepresentationSeqRef.current,
        committedOrders: TASK_STATUSES.map((status) => ({
          status,
          taskIds: computed.application.nextColumns[status].map(
            (task) => task.id
          ),
        })),
        settled: false,
      };
      keyboardDropIntentRef.current = record;

      // Space confirms a keyboard drop in the same keydown, so the persist
      // request starts here instead of waiting for the drop transition to end
      // and onDragEnd to fire.
      void persistColumns(
        computed.application.nextColumns,
        computed.application.previousColumns,
        {
          previousTask: computed.application.previousTask,
          nextTask: computed.application.nextTask,
        }
      ).then(({ persisted, version }) => {
        record.outcome = persisted ? "saved" : "failed";
        record.writeVersion = version;

        if (keyboardDropIntentRef.current !== null || !record.settled) {
          // An active intent (this one or a successor) settles the outcome; a
          // replaced intent was never settled and must not reapply.
          return;
        }
        if (!persisted) {
          // The failure path already reverted or kept the remote layout.
          return;
        }
        // The acknowledgement arrived after the drop settled: the write's
        // committed order is the stored order unless a newer full-order
        // delivery landed in the meantime.
        const remoteVersion = remoteColumnsVersionRef.current;
        if (
          version === null ||
          (remoteVersion !== null &&
            !isProjectActivityVersionNewer(version, remoteVersion))
        ) {
          return;
        }
        applyCommittedOrders(
          record.committedOrders,
          version,
          record.intentStartTaskSeq
        );
        setPersistError(null);
      });
    },
    [applyCommittedOrders, canEdit, computeDropApplication, persistColumns, remoteColumnsVersionRef, remoteTaskRepresentationSeqRef, setPersistError]
  );

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!canEdit) {
        return;
      }

      const { source, destination, reason } = result;
      const keyboardIntent = keyboardDropIntentRef.current;
      keyboardDropIntentRef.current = null;

      if (reason !== "DROP" || !destination) {
        return;
      }

      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const matchesKeyboardIntent =
        keyboardIntent !== null &&
        keyboardIntent.source.droppableId === source.droppableId &&
        keyboardIntent.source.index === source.index &&
        keyboardIntent.destination.droppableId === destination.droppableId &&
        keyboardIntent.destination.index === destination.index;

      if (matchesKeyboardIntent) {
        keyboardIntent.settled = true;
        if (keyboardIntent.outcome === "failed") {
          // The early persist already reverted and surfaced the error; leave
          // the board on the stored order instead of applying the drop locally.
          return;
        }

        const findVisibleTaskLocation = (
          taskId: string
        ): { status: TaskStatus; index: number; task: KanbanTask } | null => {
          for (const status of TASK_STATUSES) {
            const index = visibleColumns[status].findIndex(
              (task) => task.id === taskId
            );
            if (index !== -1) {
              return { status, index, task: visibleColumns[status][index] };
            }
          }
          return null;
        };

        const syncMovedTaskSummary = (task: KanbanTask) => {
          if (relatedTaskGraph.get(task.id)?.length) {
            syncRelatedTaskSummary(task.id, {
              title: task.title,
              status: task.status,
              archivedAt: null,
            });
          }
        };

        const located = findVisibleTaskLocation(keyboardIntent.movedTaskId);

        // A full-order remote delivery (typed reorder event or fresh
        // server-rendered props) carrying a project version newer than the
        // acknowledgement's write is authoritative: its order already includes
        // the committed move plus whatever landed after it, so the intent must
        // not be restored over it. While the write is still in flight its
        // version is unknown, so the newest version already applied when the
        // intent was submitted is the baseline instead.
        const remoteVersion = remoteColumnsVersionRef.current;
        const settleBaseline =
          keyboardIntent.writeVersion ?? keyboardIntent.intentStartVersion;
        const newerRemoteColumns =
          remoteVersion !== null &&
          (settleBaseline === null ||
            isProjectActivityVersionNewer(remoteVersion, settleBaseline));

        if (newerRemoteColumns) {
          setPersistError(null);
          if (located) {
            syncMovedTaskSummary(located.task);
          }
          return;
        }

        // Otherwise the local layout predates (or only partially reflects)
        // the write, so restore the committed payload orders: the stored
        // order of every lane wins while partial deltas that landed around the
        // acknowledgement keep their current positions. Re-deriving the move
        // by index is never correct once other events may have shifted cards.
        applyCommittedOrders(
          keyboardIntent.committedOrders,
          settleBaseline,
          keyboardIntent.intentStartTaskSeq
        );
        setPersistError(null);
        if (located) {
          syncMovedTaskSummary(located.task);
        }
        return;
      }

      const computed = computeDropApplication(source, destination);
      if (!computed) {
        return;
      }
      if ("error" in computed) {
        setPersistError(computed.error);
        return;
      }

      const { application } = computed;

      setColumns(application.nextColumns);
      setPersistError(null);

      void persistColumns(
        application.nextColumns,
        application.previousColumns,
        {
          previousTask: application.previousTask,
          nextTask: application.nextTask,
        }
      );

      if (relatedTaskGraph.get(application.movedTask.id)?.length) {
        syncRelatedTaskSummary(application.movedTask.id, {
          title: application.movedTask.title,
          status: application.destinationStatus,
          archivedAt: null,
        });
      }
    },
    [
      applyCommittedOrders,
      canEdit,
      computeDropApplication,
      persistColumns,
      relatedTaskGraph,
      syncRelatedTaskSummary,
      visibleColumns,
      remoteColumnsVersionRef,
      setColumns,
      setPersistError,
    ]
  );

  return { onDragEnd, handleKeyboardDropIntent, persistColumns };
}
