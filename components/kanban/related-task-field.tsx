"use client";

import {
  createPortal,
} from "react-dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
}

export function RelatedTaskSelector({
  selectedTasks,
  availableTasks,
  searchValue,
  onSearchChange,
  onAddTask,
  onRemoveTask,
  disabled = false,
}: RelatedTaskSelectorProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
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

  const shouldShowSuggestions =
    !disabled && isSearchFocused && (suggestions.length > 0 || normalizedQuery.length > 0);

  useEffect(() => {
    if (!shouldShowSuggestions) {
      setDropdownPosition(null);
      return;
    }

    const updateDropdownPosition = () => {
      const searchField = searchFieldRef.current;
      if (!searchField) {
        return;
      }

      const rect = searchField.getBoundingClientRect();
      const estimatedDropdownHeight = 164;
      const viewportPadding = 12;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const openAbove =
        availableBelow < estimatedDropdownHeight && availableAbove > availableBelow;

      setDropdownPosition({
        top: openAbove
          ? Math.max(viewportPadding, rect.top - estimatedDropdownHeight - 6)
          : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [shouldShowSuggestions, suggestions.length]);

  return (
    <div className="grid gap-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
      {selectedTasks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedTasks.map((task) => (
            <RelatedTaskPill
              key={task.id}
              task={task}
              removable={!disabled}
              onRemove={() => onRemoveTask(task.id)}
            />
          ))}
        </div>
      ) : null}

      <div ref={searchFieldRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setIsSearchFocused(false), 120);
          }}
          placeholder="Search active tasks"
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
          disabled={disabled}
        />
      </div>
      {shouldShowSuggestions &&
      dropdownPosition &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="z-[120] rounded-md border border-border/70 bg-popover p-1 shadow-lg"
              style={{
                position: "fixed",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
            >
              {suggestions.length > 0 ? (
                <div className="scrollbar-hidden max-h-36 space-y-1 overflow-y-auto">
                  {suggestions.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onAddTask(task.id)}
                      disabled={disabled}
                    >
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span className="ml-3 text-[11px] text-muted-foreground">
                        {task.status}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No active tasks match that search.
                </p>
              )}
            </div>,
            document.body
          )
        : null}
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        isArchived
          ? "border-border/70 bg-background text-foreground/85"
          : "border-border/70 bg-background text-foreground",
        highlight && "border-border bg-muted/55 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
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
        {isArchived ? (
          <Archive className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[180px] truncate">{task.title}</span>
      </button>
      <span
        className={cn(
          "text-[11px] uppercase tracking-[0.18em] opacity-70",
          isArchived && "text-emerald-700/80 dark:text-emerald-300/80"
        )}
      >
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
