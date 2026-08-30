import { LoaderCircle, RotateCcw, Search, Tags, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getTaskLabelColor } from "@/lib/task-label";
import { cn } from "@/lib/utils";

interface KanbanFilterToolbarProps {
  query: string;
  availableLabels: string[];
  selectedLabels: ReadonlySet<string>;
  shownTaskCount: number;
  totalTaskCount: number;
  isSearchLoading: boolean;
  searchError: string | null;
  onQueryChange: (query: string) => void;
  onToggleLabel: (label: string) => void;
  onClearLabels: () => void;
  onClearAll: () => void;
  onRetrySearch: () => void;
}

export function KanbanFilterToolbar({
  query,
  availableLabels,
  selectedLabels,
  shownTaskCount,
  totalTaskCount,
  isSearchLoading,
  searchError,
  onQueryChange,
  onToggleLabel,
  onClearLabels,
  onClearAll,
  onRetrySearch,
}: KanbanFilterToolbarProps) {
  const hasSearch = query.trim().length > 0;
  const hasSelectedLabels = selectedLabels.size > 0;
  const hasActiveFilters = hasSearch || hasSelectedLabels;

  return (
    <section
      aria-label="Filter Kanban tasks"
      className="rounded-2xl border border-border/70 bg-card/75 p-3 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.7)] sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="kanban-task-search"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Search tasks
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="kanban-task-search"
              type="search"
              value={query}
              maxLength={200}
              autoComplete="off"
              placeholder="Title, comment, assignee, attachment..."
              className="h-11 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-12 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-describedby="kanban-filter-results kanban-search-feedback"
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {hasSearch ? (
              <button
                type="button"
                aria-label="Clear task search"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onQueryChange("")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div
            id="kanban-search-feedback"
            className="mt-1.5 min-h-5 text-xs text-muted-foreground"
          >
            {isSearchLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Updating results...
              </span>
            ) : (
              "Search updates after a short pause."
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pt-6">
          <p
            id="kanban-filter-results"
            aria-live="polite"
            aria-atomic="true"
            className="min-h-11 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5 text-sm font-medium tabular-nums text-foreground"
          >
            {shownTaskCount} / {totalTaskCount} tasks
          </p>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onClearAll}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {searchError ? (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{searchError} The previous results are still shown.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 border-destructive/40 bg-background/70"
            onClick={onRetrySearch}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="mt-3 border-t border-border/60 pt-3">
        <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <Tags className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Labels <span className="text-xs text-muted-foreground">Match every selected label</span>
          </p>
          {hasSelectedLabels ? (
            <button
              type="button"
              className="min-h-11 rounded-md px-3 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onClearLabels}
            >
              Clear labels
            </button>
          ) : null}
        </div>

        {availableLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Available task labels">
            {availableLabels.map((label) => {
              const isSelected = selectedLabels.has(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "min-h-11 max-w-full rounded-full border-2 px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isSelected
                      ? "border-foreground/80 shadow-[0_0_0_2px_hsl(var(--background))]"
                      : "border-transparent opacity-75 hover:opacity-100"
                  )}
                  style={{ backgroundColor: getTaskLabelColor(label) }}
                  onClick={() => onToggleLabel(label)}
                >
                  <span className="block max-w-[16rem] truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No labels are available yet.</p>
        )}

        {hasActiveFilters ? (
          <p className="mt-3 text-xs text-muted-foreground" aria-label="Active filters">
            Active: {hasSearch ? `search "${query.trim()}"` : null}
            {hasSearch && hasSelectedLabels ? " - " : null}
            {hasSelectedLabels
              ? `${selectedLabels.size} label${selectedLabels.size === 1 ? "" : "s"}`
              : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
