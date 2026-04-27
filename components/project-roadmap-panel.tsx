"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import {
  Check,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Map,
  Pencil,
  PlusSquare,
  Trash2,
  X,
} from "lucide-react";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";
import {
  formatRoadmapTargetDateForDisplay,
  getRoadmapStatusLabel,
  ROADMAP_STATUSES,
  type ProjectRoadmapEvent,
  type ProjectRoadmapPhase,
  type RoadmapStatus,
} from "@/lib/roadmap-milestone";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

export type ProjectRoadmapPanelPhase = ProjectRoadmapPhase;
export type ProjectRoadmapPanelEvent = ProjectRoadmapEvent;

interface ProjectRoadmapPanelProps {
  projectId: string;
  canEdit: boolean;
  phases: ProjectRoadmapPanelPhase[];
  loadError?: string | null;
}

interface RoadmapDraftState {
  title: string;
  description: string;
  targetDate: string;
  status: RoadmapStatus;
}

interface EventDialogState {
  mode: "create" | "edit";
  phaseId: string | null;
  eventId: string | null;
  targetPhaseId: string;
}

interface RoadmapPhaseLayoutMeasurement {
  anchorY: number;
  centers: number[];
  height: number;
}

interface RoadmapSelectOption {
  value: string;
  label: string;
  description: string;
  badge?: ReactNode;
}

const DEFAULT_DRAFT_STATE: RoadmapDraftState = {
  title: "",
  description: "",
  targetDate: "",
  status: "planned",
};

const NEW_MILESTONE_TARGET = "__roadmap-new-milestone__";
const NEW_MILESTONE_DROP_ID = "__roadmap-drop-new-milestone__";
const ROADMAP_LANE_WIDTH_CLASS = "w-[21rem]";
const CONNECTOR_CARD_HEIGHT = 212;
const CONNECTOR_CARD_GAP = 16;
const CONNECTOR_TOP_OFFSET = 56;
const CONNECTOR_WIDTH = 148;

const ROADMAP_ACTION_BUTTON_CLASS =
  "rounded-full border border-transparent bg-transparent text-foreground/90 hover:border-slate-950 hover:bg-slate-950 hover:text-white dark:text-white/90 dark:hover:border-white dark:hover:bg-white dark:hover:text-slate-950";
const ROADMAP_COUNT_BADGE_CLASS =
  "rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground";

const EVENT_DESCRIPTION_PREVIEW_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  overflow: "hidden",
} satisfies CSSProperties;

function cloneDraftState(
  entity?:
    | ProjectRoadmapPanelPhase
    | ProjectRoadmapPanelEvent
    | null
): RoadmapDraftState {
  if (!entity) {
    return { ...DEFAULT_DRAFT_STATE };
  }

  return {
    title: entity.title,
    description: entity.description ?? "",
    targetDate: entity.targetDate ?? "",
    status: entity.status,
  };
}

function reorderList<T>(items: T[], sourceIndex: number, destinationIndex: number): T[] {
  const nextItems = items.slice();
  const [movedItem] = nextItems.splice(sourceIndex, 1);
  if (movedItem === undefined) {
    return items;
  }

  nextItems.splice(destinationIndex, 0, movedItem);
  return nextItems;
}

function moveEventBetweenPhases(
  phases: ProjectRoadmapPanelPhase[],
  sourcePhaseId: string,
  destinationPhaseId: string,
  sourceIndex: number,
  destinationIndex: number
): ProjectRoadmapPanelPhase[] {
  let movedEvent: ProjectRoadmapPanelEvent | null = null;

  const sourceEvents = phases.find((phase) => phase.id === sourcePhaseId)?.events ?? [];
  const nextSourceEvents = sourceEvents.filter((_, index) => {
    const shouldKeep = index !== sourceIndex;
    if (!shouldKeep) {
      movedEvent = sourceEvents[index] ?? null;
    }
    return shouldKeep;
  });

  if (!movedEvent) {
    return phases;
  }

  const eventToMove: ProjectRoadmapPanelEvent = movedEvent;

  return phases.map((phase) => {
    if (phase.id === sourcePhaseId && phase.id === destinationPhaseId) {
      return {
        ...phase,
        events: reorderList(phase.events, sourceIndex, destinationIndex).map((event, index) => ({
          ...event,
          position: index,
        })),
      };
    }

    if (phase.id === sourcePhaseId) {
      return {
        ...phase,
        events: nextSourceEvents.map((event, index) => ({
          ...event,
          position: index,
        })),
      };
    }

    if (phase.id === destinationPhaseId) {
      const nextDestinationEvents = phase.events.slice();
      nextDestinationEvents.splice(destinationIndex, 0, {
        ...eventToMove,
        phaseId: destinationPhaseId,
      });

      return {
        ...phase,
        events: nextDestinationEvents.map((event, index) => ({
          ...event,
          phaseId: destinationPhaseId,
          position: index,
        })),
      };
    }

    return phase;
  });
}

function mapRoadmapMutationError(errorCode?: string): string {
  switch (errorCode) {
    case "roadmap-title-too-short":
      return "Title must be at least 2 characters.";
    case "roadmap-title-too-long":
      return "Title must be 100 characters or fewer.";
    case "roadmap-description-too-long":
      return "Description must be 400 characters or fewer.";
    case "roadmap-target-date-invalid":
      return "Target date must be a valid calendar date.";
    case "roadmap-status-invalid":
      return "Status is invalid.";
    case "roadmap-phase-not-found":
      return "Roadmap phase not found.";
    case "roadmap-event-not-found":
      return "Roadmap event not found.";
    case "roadmap-phases-invalid":
      return "Roadmap order could not be saved because one or more phases are invalid.";
    case "roadmap-events-invalid":
      return "Roadmap event order could not be saved because one or more events are invalid.";
    case "roadmap-target-index-invalid":
      return "The drop target is invalid. Please retry.";
    case "roadmap-phase-create-failed":
      return "Could not create roadmap phase. Please retry.";
    case "roadmap-phase-update-failed":
      return "Could not update roadmap phase. Please retry.";
    case "roadmap-phase-delete-failed":
      return "Could not delete roadmap phase. Please retry.";
    case "roadmap-event-create-failed":
      return "Could not create roadmap event. Please retry.";
    case "roadmap-event-update-failed":
      return "Could not update roadmap event. Please retry.";
    case "roadmap-event-delete-failed":
      return "Could not delete roadmap event. Please retry.";
    case "roadmap-phases-reorder-failed":
    case "roadmap-events-reorder-failed":
    case "roadmap-event-move-failed":
      return "Could not save roadmap order. Please retry.";
    default:
      return "Could not save roadmap changes. Please retry.";
  }
}

async function readApiError(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error;
  } catch {
    return undefined;
  }
}

function getRoadmapStatusClasses(status: RoadmapStatus) {
  if (status === "reached") {
    return {
      accent: "text-emerald-700 dark:text-emerald-200",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
      dot: "border-emerald-500/40 bg-emerald-500",
      line: "bg-emerald-500/45 dark:bg-emerald-400/45",
      phaseCard:
        "border-emerald-500/25 bg-[linear-gradient(160deg,rgba(16,185,129,0.12),rgba(255,255,255,0.88))] dark:bg-[linear-gradient(160deg,rgba(16,185,129,0.2),rgba(15,23,42,0.86))]",
      eventCard:
        "border-emerald-500/18 bg-background/88 dark:bg-slate-950/45",
      glow: "from-emerald-500/20 via-emerald-400/5 to-transparent",
    };
  }

  if (status === "active") {
    return {
      accent: "text-amber-700 dark:text-amber-200",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      dot: "border-amber-500/40 bg-amber-500",
      line: "bg-amber-500/45 dark:bg-amber-400/45",
      phaseCard:
        "border-amber-500/25 bg-[linear-gradient(160deg,rgba(245,158,11,0.14),rgba(255,255,255,0.88))] dark:bg-[linear-gradient(160deg,rgba(245,158,11,0.18),rgba(15,23,42,0.86))]",
      eventCard:
        "border-amber-500/18 bg-background/88 dark:bg-slate-950/45",
      glow: "from-amber-500/18 via-amber-400/5 to-transparent",
    };
  }

  return {
    accent: "text-sky-700 dark:text-sky-200",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
    dot: "border-sky-500/40 bg-sky-500",
    line: "bg-sky-500/45 dark:bg-sky-400/45",
    phaseCard:
      "border-sky-500/25 bg-[linear-gradient(160deg,rgba(14,165,233,0.12),rgba(255,255,255,0.88))] dark:bg-[linear-gradient(160deg,rgba(14,165,233,0.16),rgba(15,23,42,0.86))]",
    eventCard:
      "border-sky-500/18 bg-background/88 dark:bg-slate-950/45",
    glow: "from-sky-500/18 via-sky-400/5 to-transparent",
  };
}

function getNextRoadmapStatus(status: RoadmapStatus): RoadmapStatus {
  const currentIndex = ROADMAP_STATUSES.indexOf(status);
  if (currentIndex === -1) {
    return "planned";
  }

  return ROADMAP_STATUSES[(currentIndex + 1) % ROADMAP_STATUSES.length] ?? "planned";
}

function RoadmapStatusBadge({
  status,
  onClick,
  disabled = false,
  title,
}: {
  status: RoadmapStatus;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const tone = getRoadmapStatusClasses(status);

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
          "cursor-pointer hover:scale-[1.01]",
          tone.accent
        )}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title ?? getRoadmapStatusLabel(status)}
      >
        <Badge variant="outline" className={cn(tone.badge, "pointer-events-none")}>
          {getRoadmapStatusLabel(status)}
        </Badge>
      </button>
    );
  }

  return (
    <Badge variant="outline" className={tone.badge}>
      {getRoadmapStatusLabel(status)}
    </Badge>
  );
}

function RoadmapSelectField({
  id,
  value,
  options,
  disabled = false,
  placeholder,
  showDescriptionInTrigger = true,
  onChange,
}: {
  id: string;
  value: string;
  options: RoadmapSelectOption[];
  disabled?: boolean;
  placeholder: string;
  showDescriptionInTrigger?: boolean;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) {
      setDropdownPosition(null);
      return undefined;
    }

    const updateDropdownPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const estimatedHeight = Math.min(72 * options.length, 320);
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const shouldOpenAbove =
        availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        160,
        shouldOpenAbove ? availableAbove - 8 : availableBelow - 8
      );
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - viewportPadding * 2);
      const maxLeft = window.innerWidth - viewportPadding - width;

      setDropdownPosition({
        top: shouldOpenAbove
          ? Math.max(viewportPadding, rect.top - Math.min(estimatedHeight, maxHeight) - 8)
          : rect.bottom + 8,
        left: Math.min(rect.left, Math.max(viewportPadding, maxLeft)),
        width,
        maxHeight,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateDropdownPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, options.length]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-left transition-colors",
          "shadow-[0_14px_36px_-30px_rgba(15,23,42,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
        onClick={() => {
          if (disabled) {
            return;
          }

          setIsOpen((previous) => !previous);
        }}
      >
        {selectedOption ? (
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {selectedOption.label}
                </p>
                {selectedOption.badge}
              </div>
              {showDescriptionInTrigger ? (
                <p className="truncate text-xs text-muted-foreground">
                  {selectedOption.description}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && dropdownPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              className="z-[140] overflow-hidden rounded-2xl border border-border/70 bg-popover p-1.5 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.58)]"
              style={{
                position: "fixed",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                maxHeight: dropdownPosition.maxHeight,
              }}
            >
              <div className="scrollbar-hidden space-y-1 overflow-y-auto p-0.5">
                {options.map((option) => {
                  const isSelected = option.value === selectedOption?.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted"
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">
                              {option.label}
                            </p>
                            {option.badge}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      {isSelected ? <Check className="h-4 w-4 text-foreground" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function RoadmapEntityForm({
  draft,
  title,
  subtitle,
  submitLabel,
  targetDateLabel,
  statusLabel,
  statusOptions,
  extraFields,
  isSubmitting,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: RoadmapDraftState;
  title?: string;
  subtitle?: string;
  submitLabel: string;
  targetDateLabel: string;
  statusLabel: string;
  statusOptions: RoadmapSelectOption[];
  extraFields?: ReactNode;
  isSubmitting: boolean;
  error: string | null;
  onChange: (nextDraft: RoadmapDraftState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      {title || subtitle ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
            {subtitle ? (
              <p className="text-xs leading-5 text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="roadmap-entity-title" className="text-sm font-medium">
            Title
          </label>
          <EmojiInputField
            id="roadmap-entity-title"
            value={draft.title}
            onChange={(event) =>
              onChange({
                ...draft,
                title: event.target.value,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Public launch"
            maxLength={100}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="roadmap-entity-target-date" className="text-sm font-medium">
              {targetDateLabel}
            </label>
            {draft.targetDate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={() =>
                  onChange({
                    ...draft,
                    targetDate: "",
                  })
                }
                disabled={isSubmitting}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <CalendarDateTimeField
            id="roadmap-entity-target-date"
            value={draft.targetDate}
            onChange={(nextValue) =>
              onChange({
                ...draft,
                targetDate: nextValue,
              })
            }
            includeTime={false}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="grid gap-2">
          <label htmlFor="roadmap-entity-description" className="text-sm font-medium">
            Description
          </label>
          <EmojiTextareaField
            id="roadmap-entity-description"
            value={draft.description}
            onChange={(event) =>
              onChange({
                ...draft,
                description: event.target.value,
              })
            }
            className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Describe what this moment means for the project."
            maxLength={400}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="roadmap-entity-status" className="text-sm font-medium">
            {statusLabel}
          </label>
          <RoadmapSelectField
            id="roadmap-entity-status"
            value={draft.status}
            options={statusOptions}
            placeholder="Choose a status"
            showDescriptionInTrigger={false}
            onChange={(nextStatus) =>
              onChange({
                ...draft,
                status: nextStatus as RoadmapStatus,
              })
            }
            disabled={isSubmitting}
          />
        </div>
      </div>

      {extraFields ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="grid gap-2">{extraFields}</div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function RoadmapDialogShell({
  title,
  subtitle,
  headerBadge,
  isOpen,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  headerBadge?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!isOpen) {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-[90] flex min-h-dvh items-end justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-0 sm:items-center sm:p-4">
      <div aria-hidden="true" className="absolute inset-0" onMouseDown={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-dialog-title"
        className="relative z-10 flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-background/95 shadow-[0_40px_120px_-44px_rgba(15,23,42,0.7)] backdrop-blur sm:max-h-[calc(100vh-2rem)] sm:rounded-[2rem]"
      >
        <div className="border-b border-border/60 bg-background px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="roadmap-dialog-title" className="text-xl font-semibold text-foreground">
                  {title}
                </h3>
                {headerBadge}
              </div>
              {subtitle ? (
                <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={onClose}
              aria-label={`Close ${title}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

function RoadmapEventDetailModal({
  event,
  phase,
  phaseIndex,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  event: ProjectRoadmapPanelEvent | null;
  phase: ProjectRoadmapPanelPhase | null;
  phaseIndex: number;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (event: ProjectRoadmapPanelEvent) => void;
  onDelete: (eventId: string) => void;
}) {
  if (!event || !phase) {
    return null;
  }

  const tone = getRoadmapStatusClasses(event.status);
  const milestoneLabel = `Milestone ${phaseIndex + 1}`;

  return (
    <RoadmapDialogShell
      title={event.title}
      subtitle={`${milestoneLabel} event`}
      isOpen={true}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <RoadmapStatusBadge status={event.status} />
          {event.targetDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRoadmapTargetDateForDisplay(event.targetDate)}
            </span>
          ) : null}
        </div>

        {phase.description ? (
          <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Milestone lane
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{milestoneLabel}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{phase.description}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Milestone lane
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{milestoneLabel}</p>
          </div>
        )}

        <div
          className={cn(
            "rounded-[1.6rem] border p-4 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.55)]",
            tone.phaseCard
          )}
        >
          <p className="text-sm leading-7 text-foreground/90">
            {event.description ?? "No extra note attached to this event yet."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          {canEdit ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={ROADMAP_ACTION_BUTTON_CLASS}
                onClick={() => onEdit(event)}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={ROADMAP_ACTION_BUTTON_CLASS}
                onClick={() => onDelete(event.id)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </RoadmapDialogShell>
  );
}

function sortRoadmapPhasesForDisplay(
  phases: ProjectRoadmapPanelPhase[]
): ProjectRoadmapPanelPhase[] {
  return phases
    .slice()
    .sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }

      return left.createdAt.localeCompare(right.createdAt);
    })
    .map((phase, phaseIndex) => ({
      ...phase,
      position: phaseIndex,
      events: phase.events
        .slice()
        .sort((left, right) => {
          if (left.position !== right.position) {
            return left.position - right.position;
          }

          return left.createdAt.localeCompare(right.createdAt);
        })
        .map((event, eventIndex) => ({
          ...event,
          phaseId: phase.id,
          position: eventIndex,
        })),
    }));
}

function getMilestoneLabel(phaseIndex: number): string {
  return `Milestone ${phaseIndex + 1}`;
}

function getEventCountLabel(count: number): string {
  return `${count} event${count === 1 ? "" : "s"}`;
}

function getMilestoneStatus(events: ProjectRoadmapPanelEvent[]): RoadmapStatus {
  if (events.some((event) => event.status === "active")) {
    return "active";
  }

  if (events.length > 0 && events.every((event) => event.status === "reached")) {
    return "reached";
  }

  return "planned";
}

function getLaneSlotCount(eventsCount: number): number {
  return Math.max(eventsCount, 1);
}

function getLaneStackHeight(eventsCount: number): number {
  const slotCount = getLaneSlotCount(eventsCount);
  return slotCount * CONNECTOR_CARD_HEIGHT + (slotCount - 1) * CONNECTOR_CARD_GAP;
}

function getLaneVerticalOffset(eventsCount: number, maxEventsCount: number): number {
  return Math.max(
    0,
    (getLaneStackHeight(maxEventsCount) - getLaneStackHeight(eventsCount)) / 2
  );
}

function getLaneCardCenterY(
  eventIndex: number,
  eventsCount: number,
  maxEventsCount: number
): number {
  return (
    CONNECTOR_TOP_OFFSET +
    getLaneVerticalOffset(eventsCount, maxEventsCount) +
    eventIndex * (CONNECTOR_CARD_HEIGHT + CONNECTOR_CARD_GAP) +
    CONNECTOR_CARD_HEIGHT / 2
  );
}

function getLaneConnectorAnchorY(eventsCount: number, maxEventsCount: number): number {
  if (eventsCount <= 1) {
    return getLaneCardCenterY(0, eventsCount, maxEventsCount);
  }

  const firstCenter = getLaneCardCenterY(0, eventsCount, maxEventsCount);
  const lastCenter = getLaneCardCenterY(eventsCount - 1, eventsCount, maxEventsCount);
  return (firstCenter + lastCenter) / 2;
}

function getLaneConnectorHeight(maxEventsCount: number): number {
  return CONNECTOR_TOP_OFFSET + getLaneStackHeight(maxEventsCount);
}

function buildSingleConnectorPath(width: number, startY: number, endY: number): string {
  if (Math.abs(endY - startY) < 1) {
    return `M 0 ${startY} H ${width}`;
  }

  const firstControlX = Math.round(width * 0.28);
  const secondControlX = Math.round(width * 0.72);

  return `M 0 ${startY} C ${firstControlX} ${startY} ${secondControlX} ${endY} ${width} ${endY}`;
}

function buildForkConnectorSegments(
  width: number,
  startY: number,
  targetYs: number[]
): {
  branches: Array<{ d: string; key: string }>;
  leadPath: string;
  trunkPath: string;
} {
  if (targetYs.length <= 1) {
    const endY = targetYs[0] ?? startY;
    return {
      branches: [{ key: "single", d: buildSingleConnectorPath(width, startY, endY) }],
      leadPath: "",
      trunkPath: "",
    };
  }

  const trunkX = Math.round(width * 0.42);
  const branchStemYs = targetYs.map((targetY) => {
    if (Math.abs(targetY - startY) < 1) {
      return targetY;
    }

    const verticalDirection = targetY > startY ? 1 : -1;
    const radius = Math.min(18, Math.abs(targetY - startY) / 2, (width - trunkX) / 2);
    return targetY - verticalDirection * radius;
  });
  const trunkMinY = Math.min(startY, ...branchStemYs);
  const trunkMaxY = Math.max(startY, ...branchStemYs);
  const branches = targetYs.map((targetY, index) => {
    const stemY = branchStemYs[index] ?? targetY;

    if (Math.abs(targetY - stemY) < 1) {
      return {
        key: `branch-${index}`,
        d: `M ${trunkX} ${targetY} H ${width}`,
      };
    }

    const radius = Math.abs(targetY - stemY);

    return {
      key: `branch-${index}`,
      d: `M ${trunkX} ${stemY} Q ${trunkX} ${targetY} ${trunkX + radius} ${targetY} H ${width}`,
    };
  });

  return {
    branches,
    leadPath: `M 0 ${startY} H ${trunkX - 0.5}`,
    trunkPath:
      trunkMaxY - trunkMinY < 1 ? "" : `M ${trunkX} ${trunkMinY} V ${trunkMaxY}`,
  };
}

function RoadmapDesktopConnector({
  currentPhase,
  nextPhase,
  maxEventsCount,
  currentMeasurement,
  nextMeasurement,
}: {
  currentPhase: ProjectRoadmapPanelPhase;
  nextPhase: ProjectRoadmapPanelPhase;
  maxEventsCount: number;
  currentMeasurement?: RoadmapPhaseLayoutMeasurement;
  nextMeasurement?: RoadmapPhaseLayoutMeasurement;
}) {
  const fallbackHeight = getLaneConnectorHeight(maxEventsCount);
  const width = CONNECTOR_WIDTH;
  const startY =
    currentMeasurement?.anchorY ??
    getLaneConnectorAnchorY(currentPhase.events.length, maxEventsCount);
  const targetYs =
    nextMeasurement?.centers.length
      ? nextMeasurement.centers
      : (nextPhase.events.length === 0
          ? [getLaneCardCenterY(0, nextPhase.events.length, maxEventsCount)]
          : nextPhase.events.map((_, eventIndex) =>
              getLaneCardCenterY(eventIndex, nextPhase.events.length, maxEventsCount)
            ));
  const connector = buildForkConnectorSegments(width, startY, targetYs);
  const measuredBottom = Math.max(
    startY,
    ...targetYs,
    currentMeasurement?.height ?? 0,
    nextMeasurement?.height ?? 0
  );
  const height = Math.max(fallbackHeight, Math.ceil(measuredBottom + 24));
  const strokeColor = "rgb(148 163 184 / 0.58)";
  const strokeWidth = 2.8;

  return (
    <div
      aria-hidden="true"
      className="relative hidden w-[9.25rem] shrink-0 lg:block"
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        fill="none"
      >
        {connector.leadPath ? (
          <path
            d={connector.leadPath}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        ) : null}
        {connector.trunkPath ? (
          <path
            d={connector.trunkPath}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        ) : null}
        {connector.branches.map((segment) => (
          <path
            key={segment.key}
            d={segment.d}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}

function RoadmapEventCard({
  event,
  eventIndex,
  canEdit,
  isUpdatingStatus,
  onView,
  onEdit,
  onDelete,
  onCycleStatus,
}: {
  event: ProjectRoadmapPanelEvent;
  eventIndex: number;
  canEdit: boolean;
  isUpdatingStatus: boolean;
  onView: (eventId: string) => void;
  onEdit: (event: ProjectRoadmapPanelEvent) => void;
  onDelete: (eventId: string) => void;
  onCycleStatus: (event: ProjectRoadmapPanelEvent) => void;
}) {
  const tone = getRoadmapStatusClasses(event.status);
  const nextStatus = getNextRoadmapStatus(event.status);
  const statusButtonTitle = isUpdatingStatus
    ? `Saving ${event.title} status`
    : `Change status for ${event.title} to ${getRoadmapStatusLabel(nextStatus)}`;

  return (
    <Draggable draggableId={event.id} index={eventIndex} isDragDisabled={!canEdit}>
      {(provided, snapshot) => {
        const content = (
          <article
            ref={provided.innerRef}
            {...provided.draggableProps}
            data-roadmap-event-card={event.id}
            className={cn(
              "relative min-h-[212px] rounded-[1.55rem] border p-4 shadow-[0_24px_64px_-46px_rgba(15,23,42,0.58)] transition",
              tone.phaseCard,
              snapshot.isDragging &&
                "z-20 scale-[1.01] shadow-[0_36px_100px_-44px_rgba(15,23,42,0.76)]"
            )}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <RoadmapStatusBadge
                      status={event.status}
                      onClick={
                        canEdit
                          ? () => {
                              onCycleStatus(event);
                            }
                          : undefined
                      }
                      disabled={isUpdatingStatus}
                      title={canEdit ? statusButtonTitle : undefined}
                    />
                  </div>
                  <h4 className="break-words text-lg font-semibold text-foreground">
                    {event.title}
                  </h4>
                </div>

                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Drag ${event.title}`}
                    data-roadmap-event-drag-handle={event.id}
                    {...provided.dragHandleProps}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {event.targetDate ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatRoadmapTargetDateForDisplay(event.targetDate)}
                </span>
              ) : null}

              {event.description ? (
                <p
                  className="break-words text-sm leading-6 text-muted-foreground"
                  style={EVENT_DESCRIPTION_PREVIEW_STYLE}
                >
                  {event.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No extra note attached to this event yet.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ROADMAP_ACTION_BUTTON_CLASS}
                  onClick={() => onView(event.id)}
                >
                  <Eye className="h-4 w-4" />
                  View
                </Button>

                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={ROADMAP_ACTION_BUTTON_CLASS}
                      onClick={() => onEdit(event)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={ROADMAP_ACTION_BUTTON_CLASS}
                      onClick={() => onDelete(event.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </article>
        );

        if (snapshot.isDragging && typeof document !== "undefined") {
          return createPortal(content, document.body);
        }

        return content;
      }}
    </Draggable>
  );
}

function RoadmapMilestoneLane({
  phase,
  phaseIndex,
  canEdit,
  isDesktop,
  maxEventsCount,
  statusMutationEventId,
  onViewEvent,
  onEditEvent,
  onDeleteEvent,
  onCycleEventStatus,
}: {
  phase: ProjectRoadmapPanelPhase;
  phaseIndex: number;
  canEdit: boolean;
  isDesktop: boolean;
  maxEventsCount: number;
  statusMutationEventId: string | null;
  onViewEvent: (eventId: string) => void;
  onEditEvent: (event: ProjectRoadmapPanelEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onCycleEventStatus: (event: ProjectRoadmapPanelEvent) => void;
}) {
  const milestoneLabel = getMilestoneLabel(phaseIndex);
  const milestoneStatus = getMilestoneStatus(phase.events);
  const milestoneTone = getRoadmapStatusClasses(milestoneStatus);
  const laneVerticalOffset = isDesktop
    ? getLaneVerticalOffset(phase.events.length, maxEventsCount)
    : 0;
  const laneMinHeight = isDesktop ? getLaneStackHeight(maxEventsCount) : undefined;

  return (
    <section
      className={cn("relative shrink-0", isDesktop ? ROADMAP_LANE_WIDTH_CLASS : "w-full")}
      data-roadmap-milestone={phaseIndex + 1}
      data-roadmap-phase-id={phase.id}
    >
      <div className="mb-4 flex items-center gap-3 px-1">
        <span
          className={cn(
            "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-[0_10px_28px_-18px_rgba(15,23,42,0.5)]",
            milestoneTone.dot
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-background" />
        </span>
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              "inline-flex max-w-full items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)]",
              milestoneTone.badge
            )}
          >
            {milestoneLabel}
          </p>
          <p className={cn("pl-1 text-xs font-medium", milestoneTone.accent)}>
            {getEventCountLabel(phase.events.length)}
          </p>
        </div>
      </div>

      <Droppable droppableId={phase.id} type="ROADMAP_EVENT" isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            data-roadmap-lane-dropzone={phase.id}
            className={cn(
              "px-1 pb-4 pt-1 transition",
              snapshot.isDraggingOver &&
                "rounded-[1.8rem] bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.2),transparent_40%)] shadow-[0_30px_80px_-58px_rgba(15,23,42,0.58)] dark:bg-[radial-gradient(circle_at_top_left,rgba(71,85,105,0.34),transparent_40%)]"
            )}
            style={
              laneMinHeight !== undefined
                ? {
                    minHeight: laneMinHeight,
                  }
                : undefined
            }
          >
            <div
              className="space-y-4"
              style={
                laneVerticalOffset > 0
                  ? {
                      paddingTop: laneVerticalOffset,
                    }
                  : undefined
              }
            >
              {phase.events.length === 0 ? (
                <div
                  data-roadmap-empty-state={phase.id}
                  className="flex min-h-[212px] items-center justify-center rounded-[1.55rem] bg-background/55 px-5 py-8 text-center shadow-[0_24px_64px_-54px_rgba(15,23,42,0.48)]"
                >
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground/90">No events yet</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Drop an event here or create one directly in this milestone.
                    </p>
                  </div>
                </div>
              ) : (
                phase.events.map((event, eventIndex) => (
                  <RoadmapEventCard
                    key={event.id}
                    event={event}
                    eventIndex={eventIndex}
                    canEdit={canEdit}
                    isUpdatingStatus={statusMutationEventId === event.id}
                    onView={onViewEvent}
                    onEdit={onEditEvent}
                    onDelete={onDeleteEvent}
                    onCycleStatus={onCycleEventStatus}
                  />
                ))
              )}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>
    </section>
  );
}

function RoadmapNewMilestoneDropLane({
  canEdit,
  isDesktop,
  isDraggingEvent,
  maxEventsCount,
}: {
  canEdit: boolean;
  isDesktop: boolean;
  isDraggingEvent: boolean;
  maxEventsCount: number;
}) {
  if (!canEdit) {
    return null;
  }

  const dropLaneTopOffset =
    CONNECTOR_TOP_OFFSET + getLaneVerticalOffset(1, maxEventsCount);

  return (
    <section
      className={cn(
        "relative shrink-0",
        isDesktop
          ? "hidden w-0 overflow-visible lg:block"
          : cn("w-full", !isDraggingEvent && "hidden")
      )}
      aria-hidden={!isDraggingEvent}
    >
      <Droppable droppableId={NEW_MILESTONE_DROP_ID} type="ROADMAP_EVENT" isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            data-roadmap-new-milestone-dropzone="true"
            className={cn(
              isDesktop
                ? "absolute left-5 flex min-h-[212px] w-[21rem] items-center justify-center rounded-[1.55rem] px-6 py-8 text-center transition"
                : "flex min-h-[212px] items-center justify-center rounded-[1.55rem] px-6 py-8 text-center transition",
              isDraggingEvent
                ? "pointer-events-auto opacity-0"
                : "pointer-events-none opacity-0",
              snapshot.isDraggingOver &&
                "opacity-100 bg-slate-200/90 shadow-[0_34px_90px_-44px_rgba(15,23,42,0.66)] dark:bg-slate-800/75"
            )}
            style={
              isDesktop
                ? {
                    top: dropLaneTopOffset,
                  }
                : undefined
            }
          >
            <PlusSquare className="h-5 w-5 text-muted-foreground/70" />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}

export function ProjectRoadmapPanel({
  projectId,
  canEdit,
  phases,
  loadError,
}: ProjectRoadmapPanelProps) {
  const router = useRouter();
  const { pushToast } = useToast();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "roadmap",
    defaultExpanded: true,
    logLabel: "ProjectRoadmapPanel",
  });

  const [roadmapPhases, setRoadmapPhases] = useState(() => sortRoadmapPhasesForDisplay(phases));
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);
  const [eventDraft, setEventDraft] = useState<RoadmapDraftState>({ ...DEFAULT_DRAFT_STATE });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const [eventMutationError, setEventMutationError] = useState<string | null>(null);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [isDraggingEvent, setIsDraggingEvent] = useState(false);
  const [statusMutationEventId, setStatusMutationEventId] = useState<string | null>(null);
  const [phaseLayoutMeasurements, setPhaseLayoutMeasurements] = useState<
    Record<string, RoadmapPhaseLayoutMeasurement>
  >({});
  const desktopRoadmapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRoadmapPhases(sortRoadmapPhasesForDisplay(phases));
  }, [phases]);

  useEffect(() => {
    if (!isDesktopLayout || !isExpanded) {
      setPhaseLayoutMeasurements({});
      return undefined;
    }

    const desktopRoot = desktopRoadmapRef.current;
    if (!desktopRoot) {
      return undefined;
    }

    let animationFrameId = 0;
    const collectMeasurements = () => {
      animationFrameId = 0;

      const nextMeasurements: Record<string, RoadmapPhaseLayoutMeasurement> = {};
      const phaseSections = desktopRoot.querySelectorAll<HTMLElement>("[data-roadmap-phase-id]");

      phaseSections.forEach((section) => {
        const phaseId = section.dataset.roadmapPhaseId;
        if (!phaseId) {
          return;
        }

        const sectionRect = section.getBoundingClientRect();
        const cards = Array.from(
          section.querySelectorAll<HTMLElement>("[data-roadmap-event-card]")
        );
        const centers = cards.map(
          (card) => card.getBoundingClientRect().top - sectionRect.top + card.offsetHeight / 2
        );

        if (centers.length === 0) {
          const emptyState = section.querySelector<HTMLElement>("[data-roadmap-empty-state]");
          if (emptyState) {
            const emptyRect = emptyState.getBoundingClientRect();
            centers.push(emptyRect.top - sectionRect.top + emptyState.offsetHeight / 2);
          }
        }

        const firstCenter = centers[0] ?? getLaneCardCenterY(0, 0, 1);
        const lastCenter = centers[centers.length - 1] ?? firstCenter;

        nextMeasurements[phaseId] = {
          centers,
          anchorY: centers.length <= 1 ? firstCenter : (firstCenter + lastCenter) / 2,
          height: Math.ceil(sectionRect.height),
        };
      });

      setPhaseLayoutMeasurements((currentMeasurements) => {
        const currentKeys = Object.keys(currentMeasurements);
        const nextKeys = Object.keys(nextMeasurements);
        if (currentKeys.length !== nextKeys.length) {
          return nextMeasurements;
        }

        for (const key of nextKeys) {
          const currentMeasurement = currentMeasurements[key];
          const nextMeasurement = nextMeasurements[key];
          if (!currentMeasurement || !nextMeasurement) {
            return nextMeasurements;
          }

          if (
            currentMeasurement.anchorY !== nextMeasurement.anchorY ||
            currentMeasurement.height !== nextMeasurement.height ||
            currentMeasurement.centers.length !== nextMeasurement.centers.length
          ) {
            return nextMeasurements;
          }

          for (let index = 0; index < currentMeasurement.centers.length; index += 1) {
            if (currentMeasurement.centers[index] !== nextMeasurement.centers[index]) {
              return nextMeasurements;
            }
          }
        }

        return currentMeasurements;
      });
    };

    const scheduleMeasurements = () => {
      if (animationFrameId !== 0) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(collectMeasurements);
    };

    scheduleMeasurements();

    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasurements();
    });

    resizeObserver.observe(desktopRoot);
    desktopRoot
      .querySelectorAll<HTMLElement>("[data-roadmap-phase-id], [data-roadmap-event-card]")
      .forEach((element) => resizeObserver.observe(element));

    window.addEventListener("resize", scheduleMeasurements);

    return () => {
      if (animationFrameId !== 0) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasurements);
    };
  }, [isDesktopLayout, isExpanded, roadmapPhases]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => {
      setIsDesktopLayout(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const selectedPhase =
    selectedEventId == null
      ? null
      : roadmapPhases.find((phase) => phase.events.some((event) => event.id === selectedEventId)) ?? null;
  const selectedEvent =
    selectedPhase?.events.find((event) => event.id === selectedEventId) ?? null;
  const selectedPhaseIndex =
    selectedPhase == null
      ? -1
      : roadmapPhases.findIndex((phase) => phase.id === selectedPhase.id);

  const pendingDeleteEvent =
    pendingDeleteEventId == null
      ? null
      : roadmapPhases.flatMap((phase) => phase.events).find((event) => event.id === pendingDeleteEventId) ?? null;

  function openCreateEvent() {
    setIsExpanded(true);
    setEventMutationError(null);
    setEventDraft({ ...DEFAULT_DRAFT_STATE });
    setEventDialog({
      mode: "create",
      phaseId: null,
      eventId: null,
      targetPhaseId: NEW_MILESTONE_TARGET,
    });
  }

  function openEditEvent(event: ProjectRoadmapPanelEvent) {
    setIsExpanded(true);
    setEventMutationError(null);
    setEventDraft(cloneDraftState(event));
    setEventDialog({
      mode: "edit",
      phaseId: event.phaseId,
      eventId: event.id,
      targetPhaseId: event.phaseId,
    });
  }

  function closeEventDialog() {
    setEventDialog(null);
    setEventMutationError(null);
    setEventDraft({ ...DEFAULT_DRAFT_STATE });
  }

  async function createPhaseForMilestone(
    sourceDraft: { targetDate: string | null; status: RoadmapStatus },
    milestoneIndex: number
  ): Promise<ProjectRoadmapPanelPhase> {
    const response = await fetch(`/api/projects/${projectId}/roadmap`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: getMilestoneLabel(milestoneIndex),
        description: "",
        targetDate: sourceDraft.targetDate,
        status: sourceDraft.status,
      }),
    });

    if (!response.ok) {
      throw new Error(mapRoadmapMutationError(await readApiError(response)));
    }

    const payload = (await response.json()) as { phase: ProjectRoadmapPanelPhase };
    return payload.phase;
  }

  async function deletePhaseById(phaseId: string): Promise<void> {
    const response = await fetch(`/api/projects/${projectId}/roadmap/phases/${phaseId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(mapRoadmapMutationError(await readApiError(response)));
    }
  }

  async function submitEvent() {
    if (!eventDialog) {
      return;
    }

    setIsSubmittingEvent(true);
    setEventMutationError(null);

    let targetPhaseId = eventDialog.targetPhaseId;
    let createdPhase: ProjectRoadmapPanelPhase | null = null;

    try {
      if (eventDialog.mode === "create" && targetPhaseId === NEW_MILESTONE_TARGET) {
        const nextCreatedPhase = await createPhaseForMilestone(eventDraft, roadmapPhases.length);
        createdPhase = nextCreatedPhase;
        targetPhaseId = nextCreatedPhase.id;
        setRoadmapPhases((currentPhases) =>
          sortRoadmapPhasesForDisplay([...currentPhases, { ...nextCreatedPhase, events: [] }])
        );
      }

      const endpoint =
        eventDialog.mode === "create"
          ? `/api/projects/${projectId}/roadmap/phases/${targetPhaseId}/events`
          : `/api/projects/${projectId}/roadmap/events/${eventDialog.eventId}`;
      const method = eventDialog.mode === "create" ? "POST" : "PATCH";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(eventDraft),
      });

      if (!response.ok) {
        if (createdPhase) {
          await deletePhaseById(createdPhase.id).catch(() => undefined);
          setRoadmapPhases((currentPhases) =>
            currentPhases.filter((phase) => phase.id !== createdPhase?.id)
          );
        }

        const errorCode = await readApiError(response);
        setEventMutationError(mapRoadmapMutationError(errorCode));
        return;
      }

      const payload = (await response.json()) as {
        event: ProjectRoadmapPanelEvent;
        phase: ProjectRoadmapPanelPhase;
      };

      setRoadmapPhases((currentPhases) =>
        sortRoadmapPhasesForDisplay(
          currentPhases.map((phase) => (phase.id === payload.phase.id ? payload.phase : phase))
        )
      );

      pushToast({
        message:
          eventDialog.mode === "create"
            ? `${payload.event.title} has been added to the roadmap.`
            : `${payload.event.title} has been updated.`,
        variant: "success",
      });

      closeEventDialog();
      router.refresh();
    } catch (error) {
      console.error("[ProjectRoadmapPanel.submitEvent]", error);
      if (createdPhase) {
        setRoadmapPhases((currentPhases) =>
          currentPhases.filter((phase) => phase.id !== createdPhase?.id)
        );
      }
      setEventMutationError(mapRoadmapMutationError());
    } finally {
      setIsSubmittingEvent(false);
    }
  }

  async function confirmDeleteEvent() {
    if (!pendingDeleteEvent) {
      return;
    }

    setIsDeletingEvent(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/roadmap/events/${pendingDeleteEvent.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorCode = await readApiError(response);
        pushToast({
          message: mapRoadmapMutationError(errorCode),
          variant: "error",
        });
        return;
      }

      const payload = (await response.json()) as { ok: true; phaseId: string };
      let nextPhases = sortRoadmapPhasesForDisplay(
        roadmapPhases.map((phase) =>
          phase.id === payload.phaseId
            ? {
                ...phase,
                events: phase.events
                  .filter((event) => event.id !== pendingDeleteEvent.id)
                  .map((event, index) => ({
                    ...event,
                    position: index,
                  })),
              }
            : phase
        )
      );

      const emptiedSource = nextPhases.find((phase) => phase.id === payload.phaseId);
      if (emptiedSource && emptiedSource.events.length === 0) {
        await deletePhaseById(emptiedSource.id);
        nextPhases = nextPhases.filter((phase) => phase.id !== emptiedSource.id);
      }

      setRoadmapPhases(sortRoadmapPhasesForDisplay(nextPhases));
      setPendingDeleteEventId(null);
      if (selectedEventId === pendingDeleteEvent.id) {
        setSelectedEventId(null);
      }

      pushToast({
        message: `${pendingDeleteEvent.title} has been removed.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      console.error("[ProjectRoadmapPanel.confirmDeleteEvent]", error);
      pushToast({
        message: mapRoadmapMutationError(),
        variant: "error",
      });
    } finally {
      setIsDeletingEvent(false);
    }
  }

  async function persistEventReorder(phaseId: string, eventIds: string[]) {
    const response = await fetch(`/api/projects/${projectId}/roadmap/events/reorder`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phaseId,
        eventIds,
      }),
    });

    if (!response.ok) {
      throw new Error(mapRoadmapMutationError(await readApiError(response)));
    }
  }

  async function persistEventMove(eventId: string, targetPhaseId: string, targetIndex: number) {
    const response = await fetch(`/api/projects/${projectId}/roadmap/events/move`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId,
        targetPhaseId,
        targetIndex,
      }),
    });

    if (!response.ok) {
      throw new Error(mapRoadmapMutationError(await readApiError(response)));
    }
  }

  async function cycleEventStatus(event: ProjectRoadmapPanelEvent) {
    if (statusMutationEventId !== null) {
      return;
    }

    const previousPhases = roadmapPhases;
    const nextStatus = getNextRoadmapStatus(event.status);

    setStatusMutationEventId(event.id);
    setRoadmapPhases((currentPhases) =>
      sortRoadmapPhasesForDisplay(
        currentPhases.map((phase) =>
          phase.id === event.phaseId
            ? {
                ...phase,
                events: phase.events.map((phaseEvent) =>
                  phaseEvent.id === event.id
                    ? {
                        ...phaseEvent,
                        status: nextStatus,
                      }
                    : phaseEvent
                ),
              }
            : phase
        )
      )
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/roadmap/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(mapRoadmapMutationError(await readApiError(response)));
      }

      const payload = (await response.json()) as {
        event: ProjectRoadmapPanelEvent;
        phase: ProjectRoadmapPanelPhase;
      };

      setRoadmapPhases((currentPhases) =>
        sortRoadmapPhasesForDisplay(
          currentPhases.map((phase) => (phase.id === payload.phase.id ? payload.phase : phase))
        )
      );

      pushToast({
        message: `${payload.event.title} marked as ${getRoadmapStatusLabel(payload.event.status).toLowerCase()}.`,
        variant: "success",
      });
    } catch (error) {
      console.error("[ProjectRoadmapPanel.cycleEventStatus]", error);
      setRoadmapPhases(previousPhases);
      pushToast({
        message: error instanceof Error ? error.message : mapRoadmapMutationError(),
        variant: "error",
      });
    } finally {
      setStatusMutationEventId(null);
    }
  }

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    setIsDraggingEvent(false);

    if (!destination) {
      return;
    }

    const sourcePhaseId = source.droppableId;
    const destinationPhaseId = destination.droppableId;

    if (sourcePhaseId === destinationPhaseId && source.index === destination.index) {
      return;
    }

    if (destinationPhaseId === NEW_MILESTONE_DROP_ID) {
      const sourcePhase = roadmapPhases.find((phase) => phase.id === sourcePhaseId);
      const movedEvent = sourcePhase?.events[source.index] ?? null;

      if (!movedEvent) {
        return;
      }

      try {
        const createdPhase = await createPhaseForMilestone(movedEvent, roadmapPhases.length);
        await persistEventMove(draggableId, createdPhase.id, 0);

        let nextPhases = sortRoadmapPhasesForDisplay([
          ...roadmapPhases.map((phase) =>
            phase.id === sourcePhaseId
              ? {
                  ...phase,
                  events: phase.events
                    .filter((event) => event.id !== draggableId)
                    .map((event, eventIndex) => ({
                      ...event,
                      position: eventIndex,
                    })),
                }
              : phase
          ),
          {
            ...createdPhase,
            events: [
              {
                ...movedEvent,
                phaseId: createdPhase.id,
                position: 0,
              },
            ],
          },
        ]);

        const emptiedSource = nextPhases.find((phase) => phase.id === sourcePhaseId);
        if (emptiedSource && emptiedSource.events.length === 0) {
          await deletePhaseById(emptiedSource.id);
          nextPhases = nextPhases.filter((phase) => phase.id !== emptiedSource.id);
        }

        setRoadmapPhases(sortRoadmapPhasesForDisplay(nextPhases));
        router.refresh();
      } catch (error) {
        pushToast({
          message: error instanceof Error ? error.message : mapRoadmapMutationError(),
          variant: "error",
        });
      }

      return;
    }

    const previousPhases = roadmapPhases;
    const nextPhases = sortRoadmapPhasesForDisplay(
      moveEventBetweenPhases(
        previousPhases,
        sourcePhaseId,
        destinationPhaseId,
        source.index,
        destination.index
      )
    );

    setRoadmapPhases(nextPhases);

    try {
      if (sourcePhaseId === destinationPhaseId) {
        const nextPhase = nextPhases.find((phase) => phase.id === destinationPhaseId);
        await persistEventReorder(
          destinationPhaseId,
          nextPhase?.events.map((event) => event.id) ?? []
        );
      } else {
        await persistEventMove(draggableId, destinationPhaseId, destination.index);
        const emptiedSource = nextPhases.find((phase) => phase.id === sourcePhaseId);
        if (emptiedSource && emptiedSource.events.length === 0) {
          await deletePhaseById(emptiedSource.id);
          setRoadmapPhases((currentPhases) =>
            sortRoadmapPhasesForDisplay(
              currentPhases.filter((phase) => phase.id !== emptiedSource.id)
            )
          );
        }
      }

      router.refresh();
    } catch (error) {
      setRoadmapPhases(previousPhases);
      pushToast({
        message: error instanceof Error ? error.message : mapRoadmapMutationError(),
        variant: "error",
      });
    }
  }

  const totalEvents = roadmapPhases.reduce((sum, phase) => sum + phase.events.length, 0);
  const createMilestoneLabel = getMilestoneLabel(roadmapPhases.length);
  const maxEventsCount = roadmapPhases.reduce(
    (maximum, phase) => Math.max(maximum, getLaneSlotCount(phase.events.length)),
    1
  );
  const statusSelectOptions: RoadmapSelectOption[] = ROADMAP_STATUSES.map((status) => ({
    value: status,
    label: getRoadmapStatusLabel(status),
    description:
      status === "planned"
        ? "Upcoming direction that is not in motion yet."
        : status === "active"
          ? "Currently moving or being emphasized."
          : "Already reached or completed.",
    badge: <RoadmapStatusBadge status={status} />,
  }));
  const milestonePlacementOptions: RoadmapSelectOption[] = [
    {
      value: NEW_MILESTONE_TARGET,
      label: `New milestone (${createMilestoneLabel})`,
      description: "Start a fresh lane and place this event there.",
    },
    ...roadmapPhases.map((phase, phaseIndex) => ({
      value: phase.id,
      label: getMilestoneLabel(phaseIndex),
      description:
        phase.events.length === 0
          ? "Empty lane ready for a first event."
          : `${getEventCountLabel(phase.events.length)} already in this lane.`,
      badge: (
        <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          {getEventCountLabel(phase.events.length)}
        </span>
      ),
    })),
  ];

  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-muted/40"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Map className="h-4 w-4" />
                Roadmap
              </CardTitle>
            </div>
            <span className={ROADMAP_COUNT_BADGE_CLASS}>
              {roadmapPhases.length} milestone{roadmapPhases.length === 1 ? "" : "s"}
            </span>
            <span className={cn(ROADMAP_COUNT_BADGE_CLASS, "hidden sm:inline-flex")}>
              {totalEvents} event{totalEvents === 1 ? "" : "s"}
            </span>
          </button>

          {canEdit ? (
            <Button type="button" size="sm" className="w-full sm:w-auto" onClick={openCreateEvent}>
              <PlusSquare className="h-4 w-4" />
              New event
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-5", PROJECT_SECTION_CONTENT_CLASS)}>
          {loadError ? (
            <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          ) : null}

          {roadmapPhases.length === 0 ? (
            <div className="rounded-[1.9rem] border border-dashed border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_30%)] px-5 py-10 text-center">
              <p className="text-lg font-semibold text-foreground">No roadmap yet</p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Start with the first event. Each new event creates the next milestone unless you
                place it into an existing lane.
              </p>
              {canEdit ? (
                <Button type="button" className="mt-5 rounded-full px-4" onClick={openCreateEvent}>
                  <PlusSquare className="h-4 w-4" />
                  Create the first event
                </Button>
              ) : null}
            </div>
          ) : (
            <DragDropContext
              onDragStart={() => setIsDraggingEvent(true)}
              onDragEnd={handleDragEnd}
            >
              <div
                className={cn(
                  isDesktopLayout &&
                    "overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.52)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(148,163,184,0.14)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]"
                )}
              >
                <div
                  ref={isDesktopLayout ? desktopRoadmapRef : null}
                  className={cn(
                    "gap-5",
                    isDesktopLayout ? "flex min-w-max items-start px-2 py-3" : "grid"
                  )}
                >
                  {roadmapPhases.map((phase, phaseIndex) => (
                    <div
                      key={phase.id}
                      className={isDesktopLayout ? "contents" : "grid gap-5"}
                    >
                      <RoadmapMilestoneLane
                        phase={phase}
                        phaseIndex={phaseIndex}
                        canEdit={canEdit}
                        isDesktop={isDesktopLayout}
                        maxEventsCount={maxEventsCount}
                        statusMutationEventId={statusMutationEventId}
                        onViewEvent={setSelectedEventId}
                        onEditEvent={openEditEvent}
                        onDeleteEvent={setPendingDeleteEventId}
                        onCycleEventStatus={cycleEventStatus}
                      />
                      {isDesktopLayout && phaseIndex < roadmapPhases.length - 1 ? (
                        <RoadmapDesktopConnector
                          currentPhase={phase}
                          nextPhase={roadmapPhases[phaseIndex + 1]}
                          maxEventsCount={maxEventsCount}
                          currentMeasurement={phaseLayoutMeasurements[phase.id]}
                          nextMeasurement={
                            phaseLayoutMeasurements[roadmapPhases[phaseIndex + 1]?.id ?? ""]
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                  <RoadmapNewMilestoneDropLane
                    canEdit={canEdit}
                    isDesktop={isDesktopLayout}
                    isDraggingEvent={isDraggingEvent}
                    maxEventsCount={maxEventsCount}
                  />
                </div>
              </div>
            </DragDropContext>
          )}
        </CardContent>
      ) : null}

      <RoadmapDialogShell
        title={eventDialog?.mode === "create" ? "New event" : "Edit event"}
        subtitle={
          eventDialog
            ? eventDialog.mode === "create"
              ? "Choose whether this event starts a new milestone or joins an existing one."
              : `This event currently lives in ${
                  getMilestoneLabel(
                    Math.max(
                      roadmapPhases.findIndex((phase) => phase.id === eventDialog.phaseId),
                      0
                    )
                  )
                }.`
            : undefined
        }
        headerBadge={
          eventDialog?.mode === "edit" ? (
            <Badge
              variant="outline"
              className="rounded-full border-border/70 bg-muted/30 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              Editing
            </Badge>
          ) : null
        }
        isOpen={eventDialog !== null}
        onClose={closeEventDialog}
      >
        <RoadmapEntityForm
          draft={eventDraft}
          submitLabel={eventDialog?.mode === "create" ? "Create event" : "Save event"}
          targetDateLabel="Event date"
          statusLabel="Event status"
          statusOptions={statusSelectOptions}
          isSubmitting={isSubmittingEvent}
          error={eventMutationError}
          onChange={setEventDraft}
          onSubmit={submitEvent}
          onCancel={closeEventDialog}
          extraFields={
            eventDialog?.mode === "create" ? (
              <>
                <label htmlFor="roadmap-event-target-milestone" className="text-sm font-medium">
                  Milestone placement
                </label>
                <RoadmapSelectField
                  id="roadmap-event-target-milestone"
                  value={eventDialog.targetPhaseId}
                  options={milestonePlacementOptions}
                  placeholder="Choose where this event should live"
                  onChange={(nextTargetPhaseId) =>
                    setEventDialog((currentDialog) =>
                      currentDialog
                        ? {
                            ...currentDialog,
                            targetPhaseId: nextTargetPhaseId,
                          }
                        : currentDialog
                    )
                  }
                  disabled={isSubmittingEvent}
                />
              </>
            ) : null
          }
        />
      </RoadmapDialogShell>

      <RoadmapEventDetailModal
        event={selectedEvent}
        phase={selectedPhase}
        phaseIndex={selectedPhaseIndex}
        canEdit={canEdit}
        onClose={() => setSelectedEventId(null)}
        onEdit={(event) => {
          setSelectedEventId(null);
          openEditEvent(event);
        }}
        onDelete={(eventId) => {
          setSelectedEventId(null);
          setPendingDeleteEventId(eventId);
        }}
      />

      <ConfirmDialog
        isOpen={pendingDeleteEvent !== null}
        title="Delete roadmap event?"
        description={
          pendingDeleteEvent
            ? `Delete ${pendingDeleteEvent.title}?`
            : "Delete this roadmap event?"
        }
        confirmLabel={isDeletingEvent ? "Deleting..." : "Delete"}
        isConfirming={isDeletingEvent}
        onConfirm={confirmDeleteEvent}
        onCancel={() => setPendingDeleteEventId(null)}
      />
    </Card>
  );
}
