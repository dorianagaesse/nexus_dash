import type {
  KanbanTask,
  TaskRelatedSummary,
} from "@/components/kanban-board-types";
import { normalizeRelatedTaskSummaries } from "@/lib/task-related";

function summariesMatch(
  left: TaskRelatedSummary[],
  right: TaskRelatedSummary[]
): boolean {
  return (
    left.length === right.length &&
    left.every((summary, index) => {
      const other = right[index];
      return (
        summary.id === other?.id &&
        summary.title === other.title &&
        summary.status === other.status &&
        summary.archivedAt === other.archivedAt
      );
    })
  );
}

/**
 * Reconciles one authoritative task mutation against any loaded task.
 *
 * TaskRelation is stored as one canonical, undirected row. Mutation responses
 * contain the authoritative related-task set for the changed task, so every
 * other loaded task must add or remove the inverse summary locally.
 */
export function reconcileBilateralTaskRelations(
  task: KanbanTask,
  authoritativeTask: KanbanTask
): KanbanTask {
  const authoritativeRelatedTasks = normalizeRelatedTaskSummaries(
    authoritativeTask.relatedTasks.filter(
      (relatedTask) => relatedTask.id !== authoritativeTask.id
    )
  );

  if (task.id === authoritativeTask.id) {
    return {
      ...task,
      ...authoritativeTask,
      relatedTasks: authoritativeRelatedTasks,
    };
  }

  const authoritativeRelatedTaskIds = new Set(
    authoritativeRelatedTasks.map((relatedTask) => relatedTask.id)
  );
  const inverseSummary: TaskRelatedSummary = {
    id: authoritativeTask.id,
    title: authoritativeTask.title,
    status: authoritativeTask.status,
    archivedAt: authoritativeTask.archivedAt,
  };
  const nextRelatedTasks = normalizeRelatedTaskSummaries([
    ...task.relatedTasks.filter(
      (relatedTask) => relatedTask.id !== authoritativeTask.id
    ),
    ...(authoritativeRelatedTaskIds.has(task.id) ? [inverseSummary] : []),
  ]);

  if (summariesMatch(task.relatedTasks, nextRelatedTasks)) {
    return task;
  }

  return {
    ...task,
    relatedTasks: nextRelatedTasks,
  };
}
