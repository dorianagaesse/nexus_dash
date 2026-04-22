import { TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export const EPIC_STATUSES = [
  "Ready",
  "In progress",
  "Completed",
] as const;

export type EpicStatus = (typeof EPIC_STATUSES)[number];

export interface EpicLinkedTaskStatus {
  status: TaskStatus;
  archivedAt: Date | string | null;
}

export interface EpicTaskSummary {
  id: string;
  title: string;
  status: string;
  archivedAt: string | null;
}

export interface TaskEpicSummary {
  id: string;
  name: string;
}

const EPIC_COLOR_PALETTE = [
  {
    accent: "#EA580C",
    soft: "#FFEDD5",
    border: "#FDBA74",
  },
  {
    accent: "#0F766E",
    soft: "#CCFBF1",
    border: "#5EEAD4",
  },
  {
    accent: "#1D4ED8",
    soft: "#DBEAFE",
    border: "#93C5FD",
  },
  {
    accent: "#7C3AED",
    soft: "#EDE9FE",
    border: "#C4B5FD",
  },
  {
    accent: "#BE185D",
    soft: "#FCE7F3",
    border: "#F9A8D4",
  },
  {
    accent: "#15803D",
    soft: "#DCFCE7",
    border: "#86EFAC",
  },
] as const;

function isTaskCompleted(task: EpicLinkedTaskStatus): boolean {
  return task.archivedAt != null || task.status === "Done";
}

export function deriveEpicStatus(tasks: EpicLinkedTaskStatus[]): EpicStatus {
  if (tasks.length === 0) {
    return "Ready";
  }

  if (tasks.every((task) => isTaskCompleted(task))) {
    return "Completed";
  }

  if (tasks.some((task) => task.status === "In Progress" || task.status === "Blocked")) {
    return "In progress";
  }

  if (tasks.every((task) => task.status === "Backlog")) {
    return "Ready";
  }

  return "In progress";
}

export function calculateEpicProgressPercent(tasks: EpicLinkedTaskStatus[]): number {
  if (tasks.length === 0) {
    return 0;
  }

  const completedCount = tasks.filter((task) => isTaskCompleted(task)).length;
  return Math.round((completedCount / tasks.length) * 100);
}

function hashSeed(seed: string): number {
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function getEpicColorFromName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  const paletteIndex = hashSeed(normalizedName || TASK_STATUSES[0]) % EPIC_COLOR_PALETTE.length;
  return EPIC_COLOR_PALETTE[paletteIndex]!;
}

export function mapEpicTaskSummary(task: {
  id: string;
  title: string;
  status: string;
  archivedAt: Date | string | null;
}): EpicTaskSummary {
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

export function mapTaskEpicSummary(epic: { id: string; name: string } | null): TaskEpicSummary | null {
  if (!epic) {
    return null;
  }

  return {
    id: epic.id,
    name: epic.name,
  };
}
