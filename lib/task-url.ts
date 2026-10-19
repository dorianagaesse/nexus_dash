export function isOptimisticTaskId(taskId: string): boolean {
  return taskId.startsWith("optimistic-task-");
}

export function buildTaskUrl(projectId: string, taskId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(taskId)}#kanban`;
}
