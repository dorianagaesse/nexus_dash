export interface RelatedTaskSummary {
  id: string;
  title: string;
  status: string;
  archivedAt: string | null;
}

function normalizeTaskId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function normalizeRelatedTaskIds(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const normalizedIds: string[] = [];

  for (const value of values) {
    const taskId = normalizeTaskId(value);
    if (!taskId || seen.has(taskId)) {
      continue;
    }

    seen.add(taskId);
    normalizedIds.push(taskId);
  }

  return normalizedIds;
}

export function buildCanonicalTaskRelation(taskIdA: string, taskIdB: string) {
  if (taskIdA < taskIdB) {
    return {
      leftTaskId: taskIdA,
      rightTaskId: taskIdB,
    };
  }

  return {
    leftTaskId: taskIdB,
    rightTaskId: taskIdA,
  };
}

export function mapRelatedTaskSummary(task: {
  id: string;
  title: string;
  status: string;
  archivedAt: Date | string | null;
}): RelatedTaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    archivedAt:
      task.archivedAt instanceof Date
        ? task.archivedAt.toISOString()
        : task.archivedAt ?? null,
  };
}

export function createRelatedTaskMap<T extends { id: string; relatedTasks: RelatedTaskSummary[] }>(
  tasks: T[]
) {
  return new Map(tasks.map((task) => [task.id, task.relatedTasks.map((entry) => entry.id)]));
}
