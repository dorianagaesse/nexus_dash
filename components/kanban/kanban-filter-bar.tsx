"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleSlash2,
  Filter,
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

const VIEWPORT_PADDING = 12;
const TRIGGER_GAP = 6;
const MIN_BELOW_SPACE = 240;
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_HEIGHT = 520;
const OPTION_GROUP_PREVIEW = 12;

type OptionGroupName = "labels" | "epics";

const CHIP_CLASS =
  "inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover";

const GROUP_HEADING_CLASS =
  "px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground";

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
  const [panelQuery, setPanelQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<OptionGroupName>>(
    () => new Set()
  );
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
      setPanelQuery("");
      setExpandedGroups(new Set());
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
      const availableAbove = rect.top - VIEWPORT_PADDING;

      // Prefer opening directly under the trigger. Flip above only when there
      // is genuinely no usable room below, and never stretch the panel to the
      // top of the viewport when flipped.
      const openBelow =
        availableBelow >= MIN_BELOW_SPACE || availableBelow >= availableAbove;
      let maxHeight = Math.min(
        Math.max(
          (openBelow ? availableBelow : availableAbove) - TRIGGER_GAP,
          120
        ),
        PANEL_MAX_HEIGHT
      );
      let top = openBelow
        ? rect.bottom + TRIGGER_GAP
        : rect.top - maxHeight - TRIGGER_GAP;
      if (top < VIEWPORT_PADDING) {
        maxHeight = Math.max(80, maxHeight - (VIEWPORT_PADDING - top));
        top = VIEWPORT_PADDING;
      }

      const width = Math.min(
        Math.max(rect.width, PANEL_MIN_WIDTH),
        window.innerWidth - VIEWPORT_PADDING * 2
      );
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, rect.left),
        window.innerWidth - width - VIEWPORT_PADDING
      );

      setPosition({ top, left, width, maxHeight });
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
  }, [isOpen, closePanel]);

  const toggleLabel = (label: string) => {
    onToggleLabel(label);
    setIsOpen(true);
  };

  const toggleEpic = (epicId: string) => {
    onToggleEpic(epicId);
    setIsOpen(true);
  };

  const toggleGroupExpansion = (group: OptionGroupName) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const normalizedOptionQuery = panelQuery.trim().toLowerCase();
  const isOptionSearching = normalizedOptionQuery.length > 0;
  const matchesOptionQuery = (value: string) =>
    !isOptionSearching ||
    value.toLowerCase().includes(normalizedOptionQuery);

  const matchingLabels = availableLabels.filter(matchesOptionQuery);
  const matchingEpics = availableEpics.filter((epic) =>
    matchesOptionQuery(epic.name)
  );
  const noEpicMatches =
    !isOptionSearching || "no epic".includes(normalizedOptionQuery);

  const labelsOverflow =
    !isOptionSearching && availableLabels.length > OPTION_GROUP_PREVIEW;
  const epicsOverflow =
    !isOptionSearching && availableEpics.length > OPTION_GROUP_PREVIEW;
  const labelsExpanded = expandedGroups.has("labels");
  const epicsExpanded = expandedGroups.has("epics");
  const shownLabels =
    labelsOverflow && !labelsExpanded
      ? matchingLabels.slice(0, OPTION_GROUP_PREVIEW)
      : matchingLabels;
  const shownEpics =
    epicsOverflow && !epicsExpanded
      ? matchingEpics.slice(0, OPTION_GROUP_PREVIEW)
      : matchingEpics;

  const optionTotal =
    matchingLabels.length + matchingEpics.length + (noEpicMatches ? 1 : 0);

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
              className="pointer-events-auto fixed z-[140] flex flex-col overflow-hidden rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              <div className="px-0.5 pb-1.5">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="kanban-filter-options"
                    type="search"
                    role="searchbox"
                    aria-label="Search labels and epics"
                    value={panelQuery}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Search labels and epics"
                    className={cn(
                      "h-11 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover [&::-webkit-search-cancel-button]:hidden",
                      isOptionSearching && "pr-16"
                    )}
                    onChange={(event) => setPanelQuery(event.target.value)}
                  />
                  {isOptionSearching ? (
                    <button
                      type="button"
                      aria-label="Clear option search"
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setPanelQuery("")}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1.5">
                {availableLabels.length > 0 && matchingLabels.length > 0 ? (
                  <div role="group" aria-label="Labels">
                    <p className={GROUP_HEADING_CLASS}>Labels</p>
                    <div className="flex flex-wrap gap-2 px-3 pb-1.5">
                      {shownLabels.map((label) => {
                        const isSelected = selectedLabels.has(label);
                        const labelColor = getTaskLabelColor(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={isSelected}
                            title={label}
                            className={cn(
                              CHIP_CLASS,
                              isSelected
                                ? "border-transparent text-slate-900"
                                : "border-input bg-background text-foreground hover:bg-accent"
                            )}
                            style={
                              isSelected
                                ? { backgroundColor: labelColor }
                                : undefined
                            }
                            onClick={() => toggleLabel(label)}
                          >
                            {isSelected ? (
                              <Check
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                                style={{ backgroundColor: labelColor }}
                              />
                            )}
                            <span className="max-w-[10rem] truncate">
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {labelsOverflow ? (
                      <div className="px-1 pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11 w-full justify-start px-3 text-sm font-medium text-primary hover:text-primary"
                          onClick={() => toggleGroupExpansion("labels")}
                        >
                          {labelsExpanded
                            ? "Show fewer labels"
                            : `Show all ${availableLabels.length} labels`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {(availableEpics.length > 0 && matchingEpics.length > 0) ||
                noEpicMatches ? (
                  <div role="group" aria-label="Epics">
                    <p className={GROUP_HEADING_CLASS}>Epics</p>
                    <div className="flex flex-wrap gap-2 px-3 pb-1.5">
                      {shownEpics.map((epic) => {
                        const isSelected = selectedEpicFilters.has(epic.id);
                        const color = getEpicColorFromName(epic.name);
                        return (
                          <button
                            key={epic.id}
                            type="button"
                            aria-pressed={isSelected}
                            title={epic.name}
                            className={cn(
                              CHIP_CLASS,
                              isSelected
                                ? "border-transparent text-slate-900"
                                : "border-input bg-background text-foreground hover:bg-accent"
                            )}
                            style={
                              isSelected
                                ? {
                                    backgroundColor: color.soft,
                                    borderColor: color.border,
                                  }
                                : undefined
                            }
                            onClick={() => toggleEpic(epic.id)}
                          >
                            {isSelected ? (
                              <Check
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: color.accent }}
                              />
                            )}
                            <span className="max-w-[10rem] truncate">
                              {epic.name}
                            </span>
                          </button>
                        );
                      })}
                      {noEpicMatches ? (
                        <button
                          type="button"
                          aria-pressed={selectedEpicFilters.has(
                            NO_EPIC_FILTER_VALUE
                          )}
                          className={cn(
                            CHIP_CLASS,
                            "border-dashed",
                            selectedEpicFilters.has(NO_EPIC_FILTER_VALUE)
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-input bg-background text-foreground hover:bg-accent"
                          )}
                          onClick={() => toggleEpic(NO_EPIC_FILTER_VALUE)}
                        >
                          <CircleSlash2
                            className="h-4 w-4 shrink-0 opacity-70"
                            aria-hidden="true"
                          />
                          <span>No epic</span>
                          {selectedEpicFilters.has(NO_EPIC_FILTER_VALUE) ? (
                            <Check
                              className="h-4 w-4 shrink-0"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      ) : null}
                    </div>
                    {epicsOverflow ? (
                      <div className="px-1 pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11 w-full justify-start px-3 text-sm font-medium text-primary hover:text-primary"
                          onClick={() => toggleGroupExpansion("epics")}
                        >
                          {epicsExpanded
                            ? "Show fewer epics"
                            : `Show all ${availableEpics.length} epics`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isOptionSearching && optionTotal === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No matching options
                  </p>
                ) : null}
              </div>

              {hasActiveFilters ? (
                <div className="flex justify-end border-t border-border/60 pt-1.5">
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
