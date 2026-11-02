"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KanbanTask, ProjectEpicOption } from "@/components/kanban-board-types";
import { mapTasksToColumns, type TaskColumns } from "@/components/kanban-board-utils";
import { isProjectActivityVersionNewer } from "@/lib/project-activity-version";
import { PROJECT_EPICS_RECONCILED_EVENT, type ProjectEpicsReconciledDetail } from "@/lib/project-epic-client";
import type { TaskStatus } from "@/lib/task-status";

interface RemoteTaskRepresentation {
  version: string;
  status: TaskStatus;
  seq: number;
}

export function useKanbanBoardState({
  projectId,
  initialTasks,
  initialActivityVersion,
  initialArchivedDoneTasks,
  epics,
}: {
  projectId: string;
  initialTasks: KanbanTask[];
  initialActivityVersion?: string | null;
  initialArchivedDoneTasks: KanbanTask[];
  epics: ProjectEpicOption[];
}) {
  const initialColumns = useMemo(
    () => mapTasksToColumns(initialTasks),
    [initialTasks]
  );
  const [columns, setColumns] =
    useState<TaskColumns<KanbanTask>>(initialColumns);
  const [archivedDoneTasks, setArchivedDoneTasks] = useState<KanbanTask[]>(
    initialArchivedDoneTasks
  );
  const [localEpicOptions, setLocalEpicOptions] =
    useState<ProjectEpicOption[]>(epics);
  const remoteColumnsVersionRef = useRef<string | null>(null);
  const remoteColumnsApplyCountRef = useRef(0);
  // Per-task authority from applied remote representations (task upserts and
  // creations), keyed by task id. A representation says nothing about the
  // whole-board order, but its status is authoritative for that one task, so
  // a settle must not restore an older committed lane over it. The sequence
  // marks arrival order; the version decides authority against the write.
  const remoteTaskRepresentationsRef = useRef<
    Map<string, RemoteTaskRepresentation>
  >(new Map());
  const remoteTaskRepresentationSeqRef = useRef(0);
  // Every remote columns mutation is counted so writers avoid reverting over
  // it. Only full-order deliveries - typed reorder events and fresh
  // server-rendered props - also record the activity version; partial task
  // deltas (upserts, deletions) say nothing about the whole-board order, so a
  // newer version on one of them must not outrank an acknowledged write.
  const markRemoteColumnsMutated = useCallback(() => {
    remoteColumnsApplyCountRef.current += 1;
  }, []);
  const markRemoteColumnsApplied = useCallback(
    (version: string | null | undefined) => {
      remoteColumnsApplyCountRef.current += 1;
      if (typeof version !== "string" || !version) {
        return;
      }
      const currentVersion = remoteColumnsVersionRef.current;
      if (
        currentVersion === null ||
        isProjectActivityVersionNewer(version, currentVersion)
      ) {
        remoteColumnsVersionRef.current = version;
      }
      remoteTaskRepresentationsRef.current.forEach((representation, taskId) => {
        if (
          !isProjectActivityVersionNewer(representation.version, version)
        ) {
          remoteTaskRepresentationsRef.current.delete(taskId);
        }
      });
    },
    []
  );
  const recordRemoteTaskRepresentation = useCallback(
    (taskId: string, status: TaskStatus, version: string) => {
      remoteTaskRepresentationSeqRef.current += 1;
      remoteTaskRepresentationsRef.current.set(taskId, {
        version,
        status,
        seq: remoteTaskRepresentationSeqRef.current,
      });
    },
    []
  );
  useEffect(() => {
    setColumns(initialColumns);
    // A parent refetch renders the columns at a known activity version; record
    // it so a keyboard settlement can tell fresh authority from staleness.
    markRemoteColumnsApplied(initialActivityVersion);
  }, [initialActivityVersion, initialColumns, markRemoteColumnsApplied]);

  useEffect(() => {
    setArchivedDoneTasks(initialArchivedDoneTasks);
  }, [initialArchivedDoneTasks]);

  useEffect(() => {
    setLocalEpicOptions(epics);
  }, [epics]);

  useEffect(() => {
    function handleProjectEpicsReconciled(event: Event) {
      const detail = (event as CustomEvent<ProjectEpicsReconciledDetail>).detail;
      if (detail?.projectId !== projectId) {
        return;
      }

      setLocalEpicOptions(
        detail.epics
          .filter((epic) => epic.archivedAt == null)
          .map((epic) => ({
            id: epic.id,
            name: epic.name,
            status: epic.status,
            progressPercent: epic.progressPercent,
            taskCount: epic.taskCount,
          }))
      );
    }

    window.addEventListener(
      PROJECT_EPICS_RECONCILED_EVENT,
      handleProjectEpicsReconciled
    );

    return () => {
      window.removeEventListener(
        PROJECT_EPICS_RECONCILED_EVENT,
        handleProjectEpicsReconciled
      );
    };
  }, [projectId]);

  return {
    columns,
    setColumns,
    archivedDoneTasks,
    setArchivedDoneTasks,
    localEpicOptions,
    remoteColumnsVersionRef, remoteColumnsApplyCountRef,
    remoteTaskRepresentationsRef, remoteTaskRepresentationSeqRef,
    markRemoteColumnsApplied,
    markRemoteColumnsMutated,
    recordRemoteTaskRepresentation,
  };
}

export type KanbanBoardState = ReturnType<typeof useKanbanBoardState>;
