import {
  cloneColumns,
  createEmptyColumns,
  type TaskColumns,
} from "@/components/kanban-board-utils";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";
import type { KanbanTask } from "@/components/kanban-board-types";

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

export function taskMatchesKanbanFilters(
  task: { id: string; labels: string[] },
  searchTaskIds: ReadonlySet<string> | null,
  selectedLabels: ReadonlySet<string>
): boolean {
  return (
    (searchTaskIds === null || searchTaskIds.has(task.id)) &&
    taskMatchesSelectedLabels(task.labels, selectedLabels)
  );
}

export function filterKanbanColumns<T extends { id: string; labels: string[] }>(
  columns: TaskColumns<T>,
  searchTaskIds: ReadonlySet<string> | null,
  selectedLabels: ReadonlySet<string>
): TaskColumns<T> {
  const filteredColumns = createEmptyColumns<T>();
  TASK_STATUSES.forEach((status) => {
    filteredColumns[status] = columns[status].filter((task) =>
      taskMatchesKanbanFilters(task, searchTaskIds, selectedLabels)
    );
  });
  return filteredColumns;
}

interface FilteredTaskMoveInput<T extends { id: string }> {
  columns: TaskColumns<T>;
  visibleColumns: TaskColumns<T>;
  sourceStatus: TaskStatus;
  sourceIndex: number;
  destinationStatus: TaskStatus;
  destinationIndex: number;
  transformMovedTask: (task: T, destinationStatus: TaskStatus) => T;
}

export function moveTaskUsingVisibleIndices<T extends { id: string }>(
  input: FilteredTaskMoveInput<T>
): TaskColumns<T> | null {
  const visibleSourceTask = input.visibleColumns[input.sourceStatus][input.sourceIndex];
  if (!visibleSourceTask) {
    return null;
  }

  const nextColumns = cloneColumns(input.columns);
  const fullSourceIndex = nextColumns[input.sourceStatus].findIndex(
    (task) => task.id === visibleSourceTask.id
  );
  if (fullSourceIndex === -1) {
    return null;
  }

  const [movedTask] = nextColumns[input.sourceStatus].splice(fullSourceIndex, 1);
  if (!movedTask) {
    return null;
  }

  const visibleDestinationTasks = input.visibleColumns[input.destinationStatus]
    .filter((task) => task.id !== movedTask.id);
  const fullDestinationTasks = nextColumns[input.destinationStatus];
  let fullDestinationIndex: number;

  if (visibleDestinationTasks.length === 0) {
    fullDestinationIndex = fullDestinationTasks.length;
  } else if (input.destinationIndex < visibleDestinationTasks.length) {
    const destinationAnchor = visibleDestinationTasks[input.destinationIndex];
    const anchorIndex = fullDestinationTasks.findIndex(
      (task) => task.id === destinationAnchor.id
    );
    fullDestinationIndex = anchorIndex === -1 ? fullDestinationTasks.length : anchorIndex;
  } else {
    const finalVisibleTask = visibleDestinationTasks.at(-1);
    const finalVisibleIndex = finalVisibleTask
      ? fullDestinationTasks.findIndex((task) => task.id === finalVisibleTask.id)
      : -1;
    fullDestinationIndex =
      finalVisibleIndex === -1 ? fullDestinationTasks.length : finalVisibleIndex + 1;
  }

  fullDestinationTasks.splice(
    fullDestinationIndex,
    0,
    input.transformMovedTask(movedTask, input.destinationStatus)
  );
  return nextColumns;
}
