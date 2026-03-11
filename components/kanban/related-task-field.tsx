"use client";

import { useMemo } from "react";
import { Archive, Link2, Search, X } from "lucide-react";

import type { TaskRelatedSummary } from "@/components/kanban-board-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RelatedTaskOption {
  id: string;
  title: string;
  status: string;
}

interface RelatedTaskSelectorProps {
  selectedTasks: TaskRelatedSummary[];
  availableTasks: RelatedTaskOption[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  disabled?: boolean;
  helperText?: string;
}

export function RelatedTaskSelector({
  selectedTasks,
  availableTasks,
  searchValue,
  onSearchChange,
  onAddTask,
  onRemoveTask,
  disabled = false,
  helperText = "Link tasks that belong together in this project.",
}: RelatedTaskSelectorProps) {
  const normalizedQuery = searchValue.trim().toLowerCase();

  const suggestions = useMemo(() => {
    const selectedTaskIds = new Set(selectedTasks.map((task) => task.id));
    const unselectedTasks = availableTasks.filter((task) => !selectedTaskIds.has(task.id));

    if (!normalizedQuery) {
      return unselectedTasks.slice(0, 8);
    }

    return unselectedTasks
      .filter((task) => {
        const haystack = `${task.title} ${task.status}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [availableTasks, normalizedQuery, selectedTasks]);

  return (
    <div className="grid gap-2 rounded-md border border-border/60 bg-muted/15 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        <span>{helperText}</span>
      </div>

      {selectedTasks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedTasks.map((task) => (
            <RelatedTaskPill
              key={task.id}
              task={task}
              removable={!disabled}
              onRemove={() => onRemoveTask(task.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No related tasks yet.</p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search active tasks"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
          disabled={disabled}
        />
      </div>

      {suggestions.length > 0 ? (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background p-1">
          {suggestions.map((task) => (
            <button
              key={task.id}
              type="button"
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
              onClick={() => onAddTask(task.id)}
              disabled={disabled}
            >
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <span className="ml-3 text-xs text-muted-foreground">{task.status}</span>
            </button>
          ))}
        </div>
      ) : normalizedQuery ? (
        <p className="text-xs text-muted-foreground">No active tasks match that search.</p>
      ) : null}
    </div>
  );
}

interface RelatedTaskPillProps {
  task: TaskRelatedSummary;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  highlight?: boolean;
}

export function RelatedTaskPill({
  task,
  removable = false,
  onRemove,
  onClick,
  highlight = false,
}: RelatedTaskPillProps) {
  const isArchived = Boolean(task.archivedAt);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
        isArchived
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border/70 bg-background text-foreground",
        highlight && "border-emerald-500/70 bg-emerald-500/10"
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 text-left",
          onClick ? "hover:opacity-80" : "cursor-default"
        )}
        onClick={onClick}
        disabled={!onClick}
      >
        {isArchived ? <Archive className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        <span className="max-w-[180px] truncate">{task.title}</span>
      </button>
      <span className="text-[11px] uppercase tracking-[0.18em] opacity-70">
        {isArchived ? "Archived" : task.status}
      </span>
      {removable && onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full"
          onClick={onRemove}
          aria-label={`Remove related task ${task.title}`}
        >
          <X className="h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}
