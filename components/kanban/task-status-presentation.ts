import type { TaskStatus } from "@/lib/task-status";

export const TASK_STATUS_BADGE_CLASS_NAMES: Record<TaskStatus, string> = {
  Backlog:
    "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200",
  "In Progress":
    "border-sky-200/80 bg-sky-100/80 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/55 dark:text-sky-200",
  Blocked:
    "border-amber-200/80 bg-amber-100/80 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/55 dark:text-amber-200",
  Done:
    "border-emerald-200/80 bg-emerald-100/80 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/55 dark:text-emerald-200",
};
