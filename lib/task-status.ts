export const TASK_STATUSES = [
  "Backlog",
  "In Progress",
  "Blocked",
  "Done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}
