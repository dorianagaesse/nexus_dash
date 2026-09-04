"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleSlash2,
  Filter,
  Flag,
  LoaderCircle,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { NO_EPIC_FILTER_VALUE } from "@/components/kanban/kanban-filter-utils";
import type { ProjectEpicOption } from "@/components/kanban-board-types";
import { getEpicColorFromName } from "@/lib/epic";
import { getTaskLabelColor } from "@/lib/task-label";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PROJECT_SECTION_CHROME_CLASS } from "@/components/project-dashboard/project-section-chrome";

interface KanbanFilterBarProps {
  query: string;
  availableLabels: string[];
  availableEpics: ProjectEpicOption[];
  selectedLabels: ReadonlySet<string>;
  selectedEpicFilters: ReadonlySet<string>;
  isSearchLoading: boolean;
  searchError: string | null;
  onQueryChange: (query: string) => void;
  onToggleLabel: (label: string) => void;
  onToggleEpic: (epicId: string) => void;
  onClearAll: () => void;
  onRetrySearch: () => void;
}

interface FilterPanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function KanbanFilterBar({
  query,
  availableLabels,
  availableEpics,
  selectedLabels,
  selectedEpicFilters,
  isSearchLoading,
  searchError,
  onQueryChange,
  onToggleLabel,
  onToggleEpic,
  onClearAll,
  onRetrySearch,
}: KanbanFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<FilterPanelPosition | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hasSearch = query.trim().length > 0;
  const activeFilterCount = selectedLabels.size + selectedEpicFilters.size;
  const hasActiveFilters = hasSearch || activeFilterCount > 0;

  const closePanel = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const optionCount = availableLabels.length + availableEpics.length + 1;
    const estimatedHeight = Math.min(48 * optionCount + 120, 480);

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        160,
        (openAbove ? availableAbove : availableBelow) - 6
      );
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);

      setPosition({
        top: openAbove
          ? Math.max(viewportPadding, rect.top - maxHeight - 6)
          : rect.bottom + 6,
        left: Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding),
        width,
        maxHeight,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (barRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
      }
    };

    const handleFocusChange = (event: FocusEvent) => {
      const nextTarget = event.target as Node | null;
      if (!nextTarget) {
        return;
      }
      // Keep the panel open while the user moves between the search box,
      // clear button, and trigger inside this bar.
      if (barRef.current?.contains(nextTarget)) {
        return;
      }
      // Outside the panel (for example a board card): close without stealing
      // focus, so keyboard drag on the card keeps working.
      if (panelRef.current?.contains(nextTarget)) {
        return;
      }
      setIsOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusChange);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, availableLabels.length, availableEpics.length, closePanel]);

  const toggleLabel = (label: string) => {
    onToggleLabel(label);
    setIsOpen(true);
  };

  const toggleEpic = (epicId: string) => {
    onToggleEpic(epicId);
    setIsOpen(true);
  };

  return (
    <section
      ref={barRef}
      aria-label="Search and filter Kanban tasks"
      className={cn(
        PROJECT_SECTION_CHROME_CLASS,
        "px-3 py-3 sm:px-4 sm:py-3.5"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="kanban-task-search"
              type="search"
              role="searchbox"
              aria-label="Search tasks"
              value={query}
              maxLength={200}
              autoComplete="off"
              placeholder="Search tasks"
              className={cn(
                "h-11 w-full rounded-lg border border-input bg-background py-2 pl-9 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-search-cancel-button]:hidden",
                hasSearch ? "pr-16" : "pr-10"
              )}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {isSearchLoading ? (
              <LoaderCircle
                aria-hidden="true"
                className="pointer-events-none absolute right-11 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
              />
            ) : null}
            {hasSearch ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onQueryChange("")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <Button
          ref={triggerRef}
          type="button"
          variant={activeFilterCount > 0 ? "default" : "outline"}
          aria-expanded={isOpen}
          {...(isOpen ? { "aria-controls": "kanban-filter-panel" } : {})}
          className="h-11 justify-between gap-2 px-3.5 sm:w-auto"
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span>Filter</span>
          {activeFilterCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-background/25 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 opacity-70 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </div>

      {searchError ? (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{searchError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 border-destructive/40 bg-background/70"
            onClick={onRetrySearch}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {isOpen && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id="kanban-filter-panel"
              className="pointer-events-auto z-[140] overflow-hidden rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              <div
                className="scrollbar-hidden overflow-y-auto overscroll-contain"
                style={{ maxHeight: position.maxHeight - 12 }}
              >
                {availableLabels.length > 0 ? (
                  <div role="group" aria-label="Labels" className="pb-1">
                    <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Labels
                    </p>
                    {availableLabels.map((label) => {
                      const isSelected = selectedLabels.has(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={isSelected}
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => toggleLabel(label)}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                              style={{ backgroundColor: getTaskLabelColor(label) }}
                            />
                            <span className="truncate font-medium">{label}</span>
                          </span>
                          {isSelected ? (
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div role="group" aria-label="Epics" className="pb-1">
                  <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Epics
                  </p>
                  {availableEpics.map((epic) => {
                    const isSelected = selectedEpicFilters.has(epic.id);
                    const color = getEpicColorFromName(epic.name);
                    return (
                      <button
                        key={epic.id}
                        type="button"
                        aria-pressed={isSelected}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => toggleEpic(epic.id)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                            style={{
                              backgroundColor: color.soft,
                              borderColor: color.border,
                              color: color.accent,
                            }}
                          >
                            <Flag className="h-3 w-3" />
                          </span>
                          <span className="truncate font-medium">{epic.name}</span>
                        </span>
                        {isSelected ? (
                          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={selectedEpicFilters.has(NO_EPIC_FILTER_VALUE)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => toggleEpic(NO_EPIC_FILTER_VALUE)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/30 text-muted-foreground"
                      >
                        <CircleSlash2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate font-medium">No epic</span>
                    </span>
                    {selectedEpicFilters.has(NO_EPIC_FILTER_VALUE) ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="mt-1 flex justify-end border-t border-border/60 pt-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onClearAll();
                      closePanel();
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear all filters
                  </Button>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
