"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KanbanTask, ProjectEpicOption } from "@/components/kanban-board-types";
import type { TaskColumns } from "@/components/kanban-board-utils";
import {
  NO_EPIC_FILTER_VALUE,
  buildKanbanSearchRevision,
  filterKanbanColumns,
  taskMatchesKanbanFilters,
} from "@/components/kanban/kanban-filter-utils";
import { useKanbanTaskSearch } from "@/components/kanban/use-kanban-task-search";
import { TASK_STATUSES } from "@/lib/task-status";

/** Keeps filter selections, search invalidation and lane/archive visibility together. */
export function useKanbanFilters({
  projectId,
  columns,
  archivedDoneTasks,
  localEpicOptions,
}: {
  projectId: string;
  columns: TaskColumns<KanbanTask>;
  archivedDoneTasks: KanbanTask[];
  localEpicOptions: ProjectEpicOption[];
}) {
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedEpicFilters, setSelectedEpicFilters] = useState<Set<string>>(
    () => new Set()
  );
  const allKnownLabels = useMemo(() => {
    const labels = new Map<string, string>();

    const collectLabel = (label: string) => {
      const key = label.toLocaleLowerCase();
      if (!labels.has(key)) {
        labels.set(key, label);
      }
    };

    TASK_STATUSES.forEach((status) => {
      columns[status].forEach((task) => {
        task.labels.forEach(collectLabel);
      });
    });

    archivedDoneTasks.forEach((task) => {
      task.labels.forEach(collectLabel);
    });

    return Array.from(labels.values()).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [archivedDoneTasks, columns]);

  const allTasks = useMemo(
    () => [...TASK_STATUSES.flatMap((status) => columns[status]), ...archivedDoneTasks],
    [archivedDoneTasks, columns]
  );

  const searchableTaskRevision = useMemo(
    () => buildKanbanSearchRevision(allTasks),
    [allTasks]
  );
  const {
    normalizedQuery: normalizedTaskSearchQuery,
    searchTaskIds: effectiveSearchTaskIds,
    isLoading: isTaskSearchLoading,
    error: taskSearchError,
    retry: retryTaskSearch,
  } = useKanbanTaskSearch({
    projectId,
    query: taskSearchQuery,
    searchableTaskRevision,
  });
  const visibleColumns = useMemo(
    () =>
      filterKanbanColumns(
        columns,
        effectiveSearchTaskIds,
        selectedLabels,
        selectedEpicFilters
      ),
    [columns, effectiveSearchTaskIds, selectedEpicFilters, selectedLabels]
  );
  const visibleArchivedDoneTasks = useMemo(
    () =>
      archivedDoneTasks.filter((task) =>
        taskMatchesKanbanFilters(
          task,
          effectiveSearchTaskIds,
          selectedLabels,
          selectedEpicFilters
        )
      ),
    [
      archivedDoneTasks,
      effectiveSearchTaskIds,
      selectedEpicFilters,
      selectedLabels,
    ]
  );
  const hasActiveFilters =
    normalizedTaskSearchQuery.length > 0 ||
    selectedLabels.size > 0 ||
    selectedEpicFilters.size > 0;

  const toggleLabelFilter = useCallback((label: string) => {
    setSelectedLabels((previousLabels) => {
      const nextLabels = new Set(previousLabels);
      if (nextLabels.has(label)) {
        nextLabels.delete(label);
      } else {
        nextLabels.add(label);
      }
      return nextLabels;
    });
  }, []);

  const toggleEpicFilter = useCallback((value: string) => {
    setSelectedEpicFilters((currentFilters) => {
      const nextFilters = new Set(currentFilters);
      if (nextFilters.has(value)) {
        nextFilters.delete(value);
      } else {
        nextFilters.add(value);
      }
      return nextFilters;
    });
  }, []);

  const clearKanbanFilters = useCallback(() => {
    setTaskSearchQuery("");
    setSelectedLabels(new Set());
    setSelectedEpicFilters(new Set());
  }, []);

  useEffect(() => {
    const availableEpicIds = new Set(localEpicOptions.map((epic) => epic.id));
    setSelectedEpicFilters((currentFilters) => {
      const nextFilters = new Set(
        Array.from(currentFilters).filter(
          (value) =>
            value === NO_EPIC_FILTER_VALUE || availableEpicIds.has(value)
        )
      );

      if (
        nextFilters.size === currentFilters.size &&
        Array.from(nextFilters).every((value) => currentFilters.has(value))
      ) {
        return currentFilters;
      }

      return nextFilters;
    });
  }, [localEpicOptions]);

  return {
    allTasks,
    allKnownLabels,
    taskSearchQuery,
    setTaskSearchQuery,
    selectedLabels,
    selectedEpicFilters,
    visibleColumns,
    visibleArchivedDoneTasks,
    hasActiveFilters,
    isTaskSearchLoading,
    taskSearchError,
    retryTaskSearch,
    toggleLabelFilter,
    toggleEpicFilter,
    clearKanbanFilters,
  };
}
