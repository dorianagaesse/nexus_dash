import {
  cloneColumns,
  createEmptyColumns,
  type TaskColumns,
} from "@/components/kanban-board-utils";
import type { KanbanTask } from "@/components/kanban-board-types";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export const NO_EPIC_FILTER_VALUE = "__nexusdash_no_epic__";

type KanbanFilterableTask = Pick<KanbanTask, "id" | "labels" | "epic">;

export function buildKanbanSearchRevision(tasks: KanbanTask[]): string {
  return JSON.stringify(
    tasks
      .map((task) => ({
        id: task.id,
        reference: task.reference,
        title: task.title,
        description: task.description,
        status: task.status,
        labels: task.labels,
        epic: task.epic,
        assignee: task.assignee,
        blockedFollowUps: task.blockedFollowUps,
        attachmentNames: task.attachments.map((attachment) => attachment.name),
        relatedTaskTitles: task.relatedTasks.map((relatedTask) => relatedTask.title),
        commentCount: task.commentCount,
        archivedAt: task.archivedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

export function taskMatchesSelectedLabels(
  taskLabels: string[],
  selectedLabels: ReadonlySet<string>
): boolean {
  if (selectedLabels.size === 0) {
    return true;
  }

  const normalizedTaskLabels = new Set(
    taskLabels.map((label) => label.toLocaleLowerCase())
  );
  return Array.from(selectedLabels).every((label) =>
    normalizedTaskLabels.has(label.toLocaleLowerCase())
  );
}

export function taskMatchesEpicFilters(
  task: { epic: KanbanFilterableTask["epic"] },
  selectedEpicFilters: ReadonlySet<string>
): boolean {
  if (selectedEpicFilters.size === 0) {
    return true;
  }

  if (!task.epic) {
    return selectedEpicFilters.has(NO_EPIC_FILTER_VALUE);
  }

  return selectedEpicFilters.has(task.epic.id);
}

export function taskMatchesKanbanFilters(
  task: KanbanFilterableTask,
  searchTaskIds: ReadonlySet<string> | null,
  selectedLabels: ReadonlySet<string>,
  selectedEpicFilters: ReadonlySet<string>
): boolean {
  return (
    (searchTaskIds === null || searchTaskIds.has(task.id)) &&
    taskMatchesSelectedLabels(task.labels, selectedLabels) &&
    taskMatchesEpicFilters(task, selectedEpicFilters)
  );
}

export function filterKanbanColumns<T extends KanbanFilterableTask>(
  columns: TaskColumns<T>,
  searchTaskIds: ReadonlySet<string> | null,
  selectedLabels: ReadonlySet<string>,
  selectedEpicFilters: ReadonlySet<string>
): TaskColumns<T> {
  if (
    searchTaskIds === null &&
    selectedLabels.size === 0 &&
    selectedEpicFilters.size === 0
  ) {
    return columns;
  }

  const filteredColumns = createEmptyColumns<T>();
  TASK_STATUSES.forEach((status) => {
    filteredColumns[status] = columns[status].filter((task) =>
      taskMatchesKanbanFilters(task, searchTaskIds, selectedLabels, selectedEpicFilters)
    );
  });

  return filteredColumns;
}

interface FilteredDropLocation {
  status: TaskStatus;
  index: number;
}

interface ApplyFilteredTaskDropOptions<T extends { id: string }> {
  columns: TaskColumns<T>;
  visibleColumns: TaskColumns<T>;
  source: FilteredDropLocation;
  destination: FilteredDropLocation;
  mapMovedTask: (task: T, destinationStatus: TaskStatus) => T;
}

interface AppliedFilteredTaskDrop<T> {
  columns: TaskColumns<T>;
  movedTask: T;
}

/**
 * Maps drag indices from the filtered board back to the complete persisted
 * columns. Hidden tasks never participate as drag anchors and retain their
 * relative order.
 */
export function applyFilteredTaskDrop<T extends { id: string }>({
  columns,
  visibleColumns,
  source,
  destination,
  mapMovedTask,
}: ApplyFilteredTaskDropOptions<T>): AppliedFilteredTaskDrop<T> | null {
  const visibleSourceTask = visibleColumns[source.status][source.index];
  if (!visibleSourceTask) {
    return null;
  }

  const nextColumns = cloneColumns(columns);
  const fullSourceIndex = nextColumns[source.status].findIndex(
    (task) => task.id === visibleSourceTask.id
  );
  if (fullSourceIndex < 0) {
    return null;
  }

  const [movedTask] = nextColumns[source.status].splice(fullSourceIndex, 1);
  if (!movedTask) {
    return null;
  }

  const visibleDestinationTasks = visibleColumns[destination.status].filter(
    (task) => task.id !== movedTask.id
  );
  const fullDestinationTasks = nextColumns[destination.status];
  let fullDestinationIndex = fullDestinationTasks.length;

  const destinationAnchor = visibleDestinationTasks[destination.index];
  if (destinationAnchor) {
    const anchorIndex = fullDestinationTasks.findIndex(
      (task) => task.id === destinationAnchor.id
    );
    if (anchorIndex >= 0) {
      fullDestinationIndex = anchorIndex;
    }
  } else if (visibleDestinationTasks.length > 0) {
    const finalVisibleTask =
      visibleDestinationTasks[visibleDestinationTasks.length - 1];
    const finalVisibleIndex = fullDestinationTasks.findIndex(
      (task) => task.id === finalVisibleTask.id
    );
    if (finalVisibleIndex >= 0) {
      fullDestinationIndex = finalVisibleIndex + 1;
    }
  }

  nextColumns[destination.status].splice(
    fullDestinationIndex,
    0,
    mapMovedTask(movedTask, destination.status)
  );

  return {
    columns: nextColumns,
    movedTask,
  };
}
