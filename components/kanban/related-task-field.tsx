"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Archive, Link2, Search, X } from "lucide-react";

import type { TaskRelatedSummary } from "@/components/kanban-board-types";
import { TASK_STATUS_BADGE_CLASS_NAMES } from "@/components/kanban/task-status-presentation";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";

export interface RelatedTaskOption {
  id: string;
  reference: string;
  title: string;
  status: TaskStatus;
}

interface RelatedTaskSelectorProps {
  selectedTasks: TaskRelatedSummary[];
  availableTasks: RelatedTaskOption[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function RelatedTaskSelector({
  selectedTasks,
  availableTasks,
  searchValue,
  onSearchChange,
  onAddTask,
  onRemoveTask,
  disabled = false,
  className,
  inputClassName,
}: RelatedTaskSelectorProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    listMaxHeight: number;
  } | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isSuggestionsDismissed, setIsSuggestionsDismissed] = useState(false);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId().replace(/:/g, "");
  const listboxId = `related-task-options-${generatedId}`;
  const normalizedQuery = searchValue.trim().toLowerCase();

  const suggestions = useMemo(() => {
    const selectedTaskIds = new Set(selectedTasks.map((task) => task.id));
    const unselectedTasks = availableTasks.filter(
      (task) => !selectedTaskIds.has(task.id)
    );

    if (!normalizedQuery) {
      return unselectedTasks;
    }

    return unselectedTasks.filter((task) => {
      const haystack =
        `${task.reference} ${task.title} ${task.status}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [availableTasks, normalizedQuery, selectedTasks]);

  const shouldShowSuggestions =
    !disabled && isSearchFocused && !isSuggestionsDismissed;
  const activeSuggestion = suggestions[activeSuggestionIndex] ?? null;

  const selectTask = (taskId: string) => {
    onAddTask(taskId);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (shouldShowSuggestions) {
        event.preventDefault();
        setIsSuggestionsDismissed(true);
        setActiveSuggestionIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsSuggestionsDismissed(false);
      if (suggestions.length === 0) {
        return;
      }

      setActiveSuggestionIndex((currentIndex) => {
        if (event.key === "ArrowDown") {
          return currentIndex < 0 || currentIndex >= suggestions.length - 1
            ? 0
            : currentIndex + 1;
        }

        return currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1;
      });
      return;
    }

    if (
      shouldShowSuggestions &&
      suggestions.length > 0 &&
      (event.key === "Home" || event.key === "End")
    ) {
      event.preventDefault();
      setActiveSuggestionIndex(
        event.key === "Home" ? 0 : suggestions.length - 1
      );
      return;
    }

    if (event.key === "Enter" && shouldShowSuggestions && activeSuggestion) {
      event.preventDefault();
      selectTask(activeSuggestion.id);
    }
  };

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
      const viewportPadding = 12;
      const dropdownGap = 6;
      const desiredListHeight =
        suggestions.length > 0 ? Math.min(256, suggestions.length * 44) : 44;
      const desiredDropdownHeight = desiredListHeight + 10;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const openAbove =
        availableBelow < desiredDropdownHeight &&
        availableAbove > availableBelow;
      const availableOnChosenSide = openAbove ? availableAbove : availableBelow;
      const listMaxHeight = Math.max(
        72,
        Math.min(256, availableOnChosenSide - dropdownGap - 10)
      );
      const renderedDropdownHeight = Math.min(
        desiredDropdownHeight,
        listMaxHeight + 10
      );
      const width = Math.min(
        rect.width,
        window.innerWidth - viewportPadding * 2
      );
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - viewportPadding - width
      );

      setDropdownPosition({
        top: openAbove
          ? Math.max(
              viewportPadding,
              rect.top - renderedDropdownHeight - dropdownGap
            )
          : rect.bottom + dropdownGap,
        left,
        width,
        listMaxHeight,
      });
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-overlay-popover="true"]')
      ) {
        return;
      }
      updateDropdownPosition();
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [shouldShowSuggestions, suggestions.length]);

  useEffect(() => {
    if (!shouldShowSuggestions || !activeSuggestion) {
      return;
    }

    const activeOption = document.getElementById(
      `${listboxId}-option-${activeSuggestionIndex}`
    );
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [
    activeSuggestion,
    activeSuggestionIndex,
    listboxId,
    shouldShowSuggestions,
  ]);

  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-border/60 bg-muted/10 p-2.5",
        className
      )}
    >
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
          onChange={(event) => {
            onSearchChange(event.target.value);
            setIsSuggestionsDismissed(false);
            setActiveSuggestionIndex(-1);
          }}
          onFocus={() => {
            setIsSearchFocused(true);
            setIsSuggestionsDismissed(false);
          }}
          onBlur={() => {
            window.setTimeout(() => setIsSearchFocused(false), 120);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search active tasks"
          aria-label="Search related tasks"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={shouldShowSuggestions}
          aria-controls={shouldShowSuggestions ? listboxId : undefined}
          aria-activedescendant={
            activeSuggestion
              ? `${listboxId}-option-${activeSuggestionIndex}`
              : undefined
          }
          className={cn(
            "h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
            inputClassName
          )}
          disabled={disabled}
        />
      </div>
      {shouldShowSuggestions &&
      dropdownPosition &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              data-overlay-popover="true"
              className="pointer-events-auto z-[120] overflow-hidden rounded-md border border-border/70 bg-popover p-1 shadow-lg"
              style={{
                position: "fixed",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                maxHeight: dropdownPosition.listMaxHeight + 10,
              }}
            >
              {suggestions.length > 0 ? (
                <>
                  <span className="sr-only" aria-live="polite">
                    {suggestions.length}{" "}
                    {suggestions.length === 1 ? "task" : "tasks"} available.
                  </span>
                  <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Related task suggestions"
                    data-related-task-listbox="true"
                    className="space-y-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(148,163,184,0.52)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]"
                    style={{ maxHeight: dropdownPosition.listMaxHeight }}
                  >
                    {suggestions.map((task, index) => (
                      <button
                        key={task.id}
                        id={`${listboxId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeSuggestionIndex}
                        data-active={
                          index === activeSuggestionIndex ? "true" : undefined
                        }
                        data-task-status={task.status}
                        data-task-title={task.title}
                        tabIndex={-1}
                        aria-label={`${task.reference}, ${task.title}, ${task.status}`}
                        className="grid min-h-11 w-full grid-cols-[minmax(4rem,auto)_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-muted"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActiveSuggestionIndex(index)}
                        onClick={() => selectTask(task.id)}
                        disabled={disabled}
                      >
                        <span className="select-all font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                          {task.reference}
                        </span>
                        <span
                          className="min-w-0 truncate"
                          title={task.title}
                        >
                          {task.title}
                        </span>
                        <span
                          data-task-status-badge="true"
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
                            TASK_STATUS_BADGE_CLASS_NAMES[task.status]
                          )}
                        >
                          {task.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label="Related task suggestions"
                  data-related-task-listbox="true"
                  className="px-3 py-2 text-xs text-muted-foreground"
                >
                  <p role="status">
                    {normalizedQuery
                      ? `No active tasks match “${searchValue.trim()}”.`
                      : availableTasks.length === 0
                        ? "No other active tasks are available."
                        : "All active tasks are already selected."}
                  </p>
                </div>
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
  showStatus?: boolean;
}

export function RelatedTaskPill({
  task,
  removable = false,
  onRemove,
  onClick,
  highlight = false,
  showStatus = false,
}: RelatedTaskPillProps) {
  const isArchived = Boolean(task.archivedAt);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        isArchived
          ? "border-border/70 bg-background text-foreground/85"
          : "border-border/70 bg-background text-foreground",
        highlight &&
          "border-border bg-muted/55 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
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
        <span className="max-w-[140px] truncate sm:max-w-[180px]">
          {task.title}
        </span>
      </button>
      {isArchived || showStatus ? (
        <span
          className={cn(
            "text-[11px] uppercase tracking-[0.18em] opacity-70",
            isArchived && "text-emerald-700/80 dark:text-emerald-300/80"
          )}
        >
          {isArchived ? "Archived" : task.status}
        </span>
      ) : null}
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
