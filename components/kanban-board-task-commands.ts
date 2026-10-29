import type {
  KanbanTask,
  TaskRelatedSummary,
} from "@/components/kanban-board-types";
import {
  hasProjectActorChanged,
  type ProjectActorReference,
} from "@/lib/project-actor";

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Explicit-only commands. Assignment, relation, and follow-up writes never go
 * through a timed autosave, but explicit Save sends them in the same guarded
 * request as the dirty content fields.
 */
export function buildTaskCommandPayload(
  task: KanbanTask,
  assignee: ProjectActorReference | null,
  relatedTasks: TaskRelatedSummary[],
  followUpEntry: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (hasProjectActorChanged(task.assignee, assignee)) {
    payload.assignee = assignee;
  }
  const relatedTaskIds = relatedTasks.map((relatedTask) => relatedTask.id);
  if (
    !sameStringSet(
      task.relatedTasks.map((relatedTask) => relatedTask.id),
      relatedTaskIds
    )
  ) {
    payload.relatedTaskIds = relatedTaskIds;
  }
  const entry = followUpEntry.trim();
  if (entry) {
    payload.blockedFollowUpEntry = entry;
  }
  return payload;
}

/**
 * After an acknowledgement, a command is still pending only when it was a
 * local intent against the draft's starting base and the accepted task does
 * not already reflect it. Diffing straight against the accepted task would
 * treat a remote-only command change as a phantom local edit and keep the
 * editor from ever closing.
 */
export function remainingTaskCommands(
  startingBase: KanbanTask | null,
  acceptedTask: KanbanTask,
  assignee: ProjectActorReference | null,
  relatedTasks: TaskRelatedSummary[],
  followUpEntry: string
): Record<string, unknown> {
  if (!startingBase) return {};
  const intended = buildTaskCommandPayload(
    startingBase,
    assignee,
    relatedTasks,
    followUpEntry
  );
  const stillDifferent = buildTaskCommandPayload(
    acceptedTask,
    assignee,
    relatedTasks,
    followUpEntry
  );
  const pending: Record<string, unknown> = {};
  for (const key of Object.keys(intended)) {
    if (key in stillDifferent) pending[key] = intended[key];
  }
  return pending;
}
