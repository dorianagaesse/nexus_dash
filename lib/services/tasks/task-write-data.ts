import type { Task, TaskAssigneeChange } from "@prisma/client";
import type { DbClient } from "@/lib/services/rls-context";

// Scalar-only contracts: callers supply business decisions, never Prisma query
// arguments, relation mutations, revision increments, or arbitrary update operators.
type TaskAssignmentFields = Pick<Task,
  | "assigneeKind" | "assigneeUserId" | "assigneeCredentialId"
  | "assigneeDisplayNameSnapshot" | "assigneeAssignedByKind"
  | "assigneeAssignedByUserId" | "assigneeAssignedByCredentialId"
  | "assigneeAssignedByDisplayNameSnapshot" | "assigneeAssignedAt"
>;
type TaskAuthorFields = Pick<Task, "updatedByUserId"> & Partial<Pick<Task,
  "updatedByCredentialId" | "updatedByCredentialLabel"
>>;
export type TaskCreationFields = Pick<Task,
  | "projectId" | "title" | "description" | "deadlineAt" | "epicId"
  | "label" | "labelsJson" | "status" | "position" | "createdByUserId"
> & TaskAuthorFields & TaskAssignmentFields & Partial<Pick<Task,
  "createdByCredentialId" | "createdByCredentialLabel"
>>;
export type TaskContentEdit = TaskAuthorFields & Partial<TaskAssignmentFields> &
  Partial<Pick<Task, "title" | "description" | "deadlineAt" | "epicId" | "label" | "labelsJson">>;
export type TaskLanePlacement = TaskAuthorFields & Pick<Task,
  "status" | "position" | "archivedAt" | "completedAt"
>;
export type TaskArchiveChange = TaskAuthorFields & Pick<Task, "archivedAt">;
export type TaskAssignmentChange = Omit<TaskAssigneeChange, "id">;

// All operations participate in the caller's transaction. In particular, history
// stays after relation/attachment work, and no helper commits or emits activity.
export function insertTaskWithAttribution(db: DbClient, data: TaskCreationFields) {
  return db.task.create({ data, select: { id: true } });
}

export async function persistTaskContentEdit(db: DbClient, taskId: string, data: TaskContentEdit): Promise<void> {
  await db.task.update({ where: { id: taskId }, data });
}

export async function persistTaskLanePlacement(db: DbClient, taskId: string, data: TaskLanePlacement): Promise<void> {
  await db.task.update({ where: { id: taskId }, data });
}

export function persistTaskArchive(db: DbClient, taskId: string, data: TaskArchiveChange) {
  return db.task.update({ where: { id: taskId }, data, select: { archivedAt: true } });
}

export async function persistTaskRestore(db: DbClient, taskId: string, data: TaskArchiveChange): Promise<void> {
  await db.task.update({ where: { id: taskId }, data, select: { id: true } });
}

// Database cascades remove Task-owned children; the use case performs file cleanup.
// Also used for the existing best-effort cleanup after a failed creation.
export async function removeTaskWithDependents(db: DbClient, taskId: string): Promise<void> {
  await db.task.delete({ where: { id: taskId } });
}

export async function appendTaskAssignmentChange(db: DbClient, data: TaskAssignmentChange): Promise<void> {
  await db.taskAssigneeChange.create({ data });
}

export async function appendTaskBlockedFollowUp(db: DbClient, input: { taskId: string; content: string }): Promise<void> {
  await db.taskBlockedFollowUp.create({ data: input });
}
