"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import {
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

interface PhaseDialogState {
  mode: "create" | "edit";
  phaseId: string | null;
}

interface EventDialogState {
  mode: "create" | "edit";
  phaseId: string;
  eventId: string | null;
}

const DEFAULT_DRAFT_STATE: RoadmapDraftState = {
  title: "",
  description: "",
  targetDate: "",
  status: "planned",
};

const ROADMAP_ACTION_BUTTON_CLASS =
  "rounded-full border border-transparent bg-transparent text-foreground/90 hover:border-slate-950 hover:bg-slate-950 hover:text-white dark:text-white/90 dark:hover:border-white dark:hover:bg-white dark:hover:text-slate-950";

const EVENT_DESCRIPTION_PREVIEW_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  overflow: "hidden",
} satisfies CSSProperties;

const PHASE_DESCRIPTION_PREVIEW_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
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

function RoadmapStatusBadge({ status }: { status: RoadmapStatus }) {
  const tone = getRoadmapStatusClasses(status);

  return (
    <Badge variant="outline" className={tone.badge}>
      {getRoadmapStatusLabel(status)}
    </Badge>
  );
}

function RoadmapEntityForm({
  draft,
  title,
  subtitle,
  submitLabel,
  targetDateLabel,
  statusLabel,
  isSubmitting,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: RoadmapDraftState;
  title: string;
  subtitle: string;
  submitLabel: string;
  targetDateLabel: string;
  statusLabel: string;
  isSubmitting: boolean;
  error: string | null;
  onChange: (nextDraft: RoadmapDraftState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
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
          <select
            id="roadmap-entity-status"
            value={draft.status}
            onChange={(event) =>
              onChange({
                ...draft,
                status: event.target.value as RoadmapStatus,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={isSubmitting}
          >
            {ROADMAP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getRoadmapStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
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
  isOpen,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/55 p-3 sm:items-center sm:justify-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0" onMouseDown={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-dialog-title"
        className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-border/70 bg-background p-5 shadow-[0_35px_100px_-40px_rgba(15,23,42,0.65)] sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 id="roadmap-dialog-title" className="text-xl font-semibold text-foreground">
              {title}
            </h3>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
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

        {children}
      </div>
    </div>
  );
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

  return (
    <RoadmapDialogShell
      title={event.title}
      subtitle={`Milestone ${phaseIndex + 1} · ${phase.title}`}
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
              Parent milestone
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{phase.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{phase.description}</p>
          </div>
        ) : null}

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

function RoadmapEventCard({
  event,
  phaseIndex,
  eventIndex,
  eventsCount,
  canEdit,
  onView,
  onEdit,
  onDelete,
}: {
  event: ProjectRoadmapPanelEvent;
  phaseIndex: number;
  eventIndex: number;
  eventsCount: number;
  canEdit: boolean;
  onView: (eventId: string) => void;
  onEdit: (event: ProjectRoadmapPanelEvent) => void;
  onDelete: (eventId: string) => void;
}) {
  const tone = getRoadmapStatusClasses(event.status);

  return (
    <Draggable draggableId={event.id} index={eventIndex} isDragDisabled={!canEdit}>
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "relative rounded-[1.45rem] border p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.55)] transition",
            tone.eventCard,
            snapshot.isDragging && "shadow-lg ring-1 ring-primary/25"
          )}
        >
          {eventsCount > 1 ? (
            <>
              {eventIndex > 0 ? (
                <span className={cn("absolute left-5 top-[-1rem] h-4 w-0.5", tone.line)} />
              ) : null}
              {eventIndex < eventsCount - 1 ? (
                <span className={cn("absolute bottom-[-1rem] left-5 h-4 w-0.5", tone.line)} />
              ) : null}
            </>
          ) : null}

          <span
            className={cn(
              "absolute left-3.5 top-5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background shadow-sm",
              tone.dot
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
          </span>

          <div className="space-y-4 pl-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-[0.2em]",
                      tone.accent
                    )}
                  >
                    Event {phaseIndex + 1}.{eventIndex + 1}
                  </span>
                  <RoadmapStatusBadge status={event.status} />
                </div>
                <h4 className="break-words text-base font-semibold text-foreground">{event.title}</h4>
              </div>

              {canEdit ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label={`Drag ${event.title}`}
                    {...provided.dragHandleProps}
                  >
                    <GripVertical className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            {event.targetDate ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatRoadmapTargetDateForDisplay(event.targetDate)}
              </span>
            ) : null}

            {event.description ? (
              <p className="break-words text-sm leading-6 text-muted-foreground" style={EVENT_DESCRIPTION_PREVIEW_STYLE}>
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
      )}
    </Draggable>
  );
}

function RoadmapPhaseCard({
  phase,
  phaseIndex,
  totalPhases,
  canEdit,
  isDesktop,
  onCreateEvent,
  onViewEvent,
  onEditPhase,
  onEditEvent,
  onDeletePhase,
  onDeleteEvent,
}: {
  phase: ProjectRoadmapPanelPhase;
  phaseIndex: number;
  totalPhases: number;
  canEdit: boolean;
  isDesktop: boolean;
  onCreateEvent: (phase: ProjectRoadmapPanelPhase) => void;
  onViewEvent: (eventId: string) => void;
  onEditPhase: (phase: ProjectRoadmapPanelPhase) => void;
  onEditEvent: (event: ProjectRoadmapPanelEvent) => void;
  onDeletePhase: (phaseId: string) => void;
  onDeleteEvent: (eventId: string) => void;
}) {
  const tone = getRoadmapStatusClasses(phase.status);

  return (
    <Draggable draggableId={phase.id} index={phaseIndex} isDragDisabled={!canEdit}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "relative shrink-0",
            isDesktop ? "w-[23rem]" : "w-full",
            snapshot.isDragging && "z-20"
          )}
        >
          <div className="mb-4 flex items-center gap-3 pl-1">
            <span
              className={cn(
                "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-sm",
                tone.dot
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
            </span>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <p className={cn("text-[11px] font-medium uppercase tracking-[0.24em]", tone.accent)}>
                  Milestone {phaseIndex + 1}
                </p>
              </div>
              {isDesktop && phaseIndex < totalPhases - 1 ? (
                <div className={cn("h-0.5 flex-1 rounded-full", tone.line)} />
              ) : null}
            </div>

            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label={`Drag ${phase.title}`}
                {...provided.dragHandleProps}
              >
                <GripVertical className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <section
            className={cn(
              "relative overflow-hidden rounded-[1.85rem] border p-4 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.55)] backdrop-blur-sm transition",
              tone.phaseCard,
              snapshot.isDragging && "ring-1 ring-primary/25"
            )}
          >
            <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-85", tone.glow)} />

            <div className="relative space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RoadmapStatusBadge status={phase.status} />
                      <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 text-muted-foreground">
                        {phase.events.length} event{phase.events.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <h3 className="break-words text-lg font-semibold text-foreground">{phase.title}</h3>
                  </div>

                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={ROADMAP_ACTION_BUTTON_CLASS}
                        onClick={() => onCreateEvent(phase)}
                      >
                        <PlusSquare className="h-4 w-4" />
                        Event
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={ROADMAP_ACTION_BUTTON_CLASS}
                        onClick={() => onEditPhase(phase)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={ROADMAP_ACTION_BUTTON_CLASS}
                        onClick={() => onDeletePhase(phase.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>

                {phase.targetDate ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatRoadmapTargetDateForDisplay(phase.targetDate)}
                  </span>
                ) : null}

                {phase.description ? (
                  <p className="text-sm leading-6 text-muted-foreground" style={PHASE_DESCRIPTION_PREVIEW_STYLE}>
                    {phase.description}
                  </p>
                ) : null}
              </div>

              <Droppable droppableId={phase.id} type="ROADMAP_EVENT" isDropDisabled={!canEdit}>
                {(droppableProvided, droppableSnapshot) => (
                  <div
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                    className={cn(
                      "space-y-4 rounded-[1.5rem] border border-dashed border-border/45 bg-background/35 p-3 transition",
                      droppableSnapshot.isDraggingOver && "border-primary/35 bg-primary/5"
                    )}
                  >
                    {phase.events.length === 0 ? (
                      <div className="rounded-[1.25rem] border border-border/50 bg-background/75 px-4 py-6 text-center">
                        <p className="text-sm font-medium text-foreground/90">No events yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add the first event that makes this milestone concrete.
                        </p>
                      </div>
                    ) : (
                      phase.events.map((event, eventIndex) => (
                        <RoadmapEventCard
                          key={event.id}
                          event={event}
                          phaseIndex={phaseIndex}
                          eventIndex={eventIndex}
                          eventsCount={phase.events.length}
                          canEdit={canEdit}
                          onView={onViewEvent}
                          onEdit={onEditEvent}
                          onDelete={onDeleteEvent}
                        />
                      ))
                    )}
                    {droppableProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </section>
        </div>
      )}
    </Draggable>
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

  const [roadmapPhases, setRoadmapPhases] = useState(phases);
  const [phaseDialog, setPhaseDialog] = useState<PhaseDialogState | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<RoadmapDraftState>({ ...DEFAULT_DRAFT_STATE });
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);
  const [eventDraft, setEventDraft] = useState<RoadmapDraftState>({ ...DEFAULT_DRAFT_STATE });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pendingDeletePhaseId, setPendingDeletePhaseId] = useState<string | null>(null);
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const [phaseMutationError, setPhaseMutationError] = useState<string | null>(null);
  const [eventMutationError, setEventMutationError] = useState<string | null>(null);
  const [isSubmittingPhase, setIsSubmittingPhase] = useState(false);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [isDeletingPhase, setIsDeletingPhase] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);

  useEffect(() => {
    setRoadmapPhases(phases);
  }, [phases]);

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

  const pendingDeletePhase =
    roadmapPhases.find((phase) => phase.id === pendingDeletePhaseId) ?? null;
  const pendingDeleteEvent =
    pendingDeleteEventId == null
      ? null
      : roadmapPhases.flatMap((phase) => phase.events).find((event) => event.id === pendingDeleteEventId) ?? null;

  function openCreatePhase() {
    setIsExpanded(true);
    setPhaseMutationError(null);
    setPhaseDraft({ ...DEFAULT_DRAFT_STATE });
    setPhaseDialog({
      mode: "create",
      phaseId: null,
    });
  }

  function openEditPhase(phase: ProjectRoadmapPanelPhase) {
    setIsExpanded(true);
    setPhaseMutationError(null);
    setPhaseDraft(cloneDraftState(phase));
    setPhaseDialog({
      mode: "edit",
      phaseId: phase.id,
    });
  }

  function openCreateEvent(phase: ProjectRoadmapPanelPhase) {
    setIsExpanded(true);
    setEventMutationError(null);
    setEventDraft({
      ...DEFAULT_DRAFT_STATE,
      status: phase.status,
    });
    setEventDialog({
      mode: "create",
      phaseId: phase.id,
      eventId: null,
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
    });
  }

  function closePhaseDialog() {
    setPhaseDialog(null);
    setPhaseMutationError(null);
    setPhaseDraft({ ...DEFAULT_DRAFT_STATE });
  }

  function closeEventDialog() {
    setEventDialog(null);
    setEventMutationError(null);
    setEventDraft({ ...DEFAULT_DRAFT_STATE });
  }

  async function submitPhase() {
    if (!phaseDialog) {
      return;
    }

    setIsSubmittingPhase(true);
    setPhaseMutationError(null);

    const endpoint =
      phaseDialog.mode === "create"
        ? `/api/projects/${projectId}/roadmap`
        : `/api/projects/${projectId}/roadmap/phases/${phaseDialog.phaseId}`;
    const method = phaseDialog.mode === "create" ? "POST" : "PATCH";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(phaseDraft),
      });

      if (!response.ok) {
        const errorCode = await readApiError(response);
        setPhaseMutationError(mapRoadmapMutationError(errorCode));
        return;
      }

      const payload = (await response.json()) as { phase: ProjectRoadmapPanelPhase };
      if (phaseDialog.mode === "create") {
        setRoadmapPhases((currentPhases) => [...currentPhases, payload.phase]);
        pushToast({
          message: `${payload.phase.title} is now on the roadmap.`,
          variant: "success",
        });
      } else {
        setRoadmapPhases((currentPhases) =>
          currentPhases.map((phase) => (phase.id === payload.phase.id ? payload.phase : phase))
        );
        pushToast({
          message: `${payload.phase.title} has been updated.`,
          variant: "success",
        });
      }

      closePhaseDialog();
      router.refresh();
    } catch (error) {
      console.error("[ProjectRoadmapPanel.submitPhase]", error);
      setPhaseMutationError(mapRoadmapMutationError());
    } finally {
      setIsSubmittingPhase(false);
    }
  }

  async function submitEvent() {
    if (!eventDialog) {
      return;
    }

    setIsSubmittingEvent(true);
    setEventMutationError(null);

    const endpoint =
      eventDialog.mode === "create"
        ? `/api/projects/${projectId}/roadmap/phases/${eventDialog.phaseId}/events`
        : `/api/projects/${projectId}/roadmap/events/${eventDialog.eventId}`;
    const method = eventDialog.mode === "create" ? "POST" : "PATCH";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(eventDraft),
      });

      if (!response.ok) {
        const errorCode = await readApiError(response);
        setEventMutationError(mapRoadmapMutationError(errorCode));
        return;
      }

      const payload = (await response.json()) as {
        event: ProjectRoadmapPanelEvent;
        phase: ProjectRoadmapPanelPhase;
      };

      setRoadmapPhases((currentPhases) =>
        currentPhases.map((phase) => (phase.id === payload.phase.id ? payload.phase : phase))
      );

      pushToast({
        message:
          eventDialog.mode === "create"
            ? `${payload.event.title} has been added to ${payload.phase.title}.`
            : `${payload.event.title} has been updated.`,
        variant: "success",
      });

      closeEventDialog();
      router.refresh();
    } catch (error) {
      console.error("[ProjectRoadmapPanel.submitEvent]", error);
      setEventMutationError(mapRoadmapMutationError());
    } finally {
      setIsSubmittingEvent(false);
    }
  }

  async function confirmDeletePhase() {
    if (!pendingDeletePhase) {
      return;
    }

    setIsDeletingPhase(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/roadmap/phases/${pendingDeletePhase.id}`,
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

      setRoadmapPhases((currentPhases) =>
        currentPhases.filter((phase) => phase.id !== pendingDeletePhase.id)
      );
      setPendingDeletePhaseId(null);

      if (selectedPhase?.id === pendingDeletePhase.id) {
        setSelectedEventId(null);
      }

      pushToast({
        message: `${pendingDeletePhase.title} has been removed.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      console.error("[ProjectRoadmapPanel.confirmDeletePhase]", error);
      pushToast({
        message: mapRoadmapMutationError(),
        variant: "error",
      });
    } finally {
      setIsDeletingPhase(false);
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
      setRoadmapPhases((currentPhases) =>
        currentPhases.map((phase) =>
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

  async function persistPhaseReorder(nextPhases: ProjectRoadmapPanelPhase[]) {
    const response = await fetch(`/api/projects/${projectId}/roadmap/phases/reorder`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phaseIds: nextPhases.map((phase) => phase.id),
      }),
    });

    if (!response.ok) {
      throw new Error(mapRoadmapMutationError(await readApiError(response)));
    }

    router.refresh();
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

    router.refresh();
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

    router.refresh();
  }

  async function handleDragEnd(result: DropResult) {
    const { destination, source, type, draggableId } = result;

    if (!destination) {
      return;
    }

    if (type === "ROADMAP_PHASE") {
      if (destination.index === source.index) {
        return;
      }

      const previousPhases = roadmapPhases;
      const nextPhases = reorderList(previousPhases, source.index, destination.index).map(
        (phase, index) => ({
          ...phase,
          position: index,
        })
      );

      setRoadmapPhases(nextPhases);

      try {
        await persistPhaseReorder(nextPhases);
      } catch (error) {
        setRoadmapPhases(previousPhases);
        pushToast({
          message: error instanceof Error ? error.message : mapRoadmapMutationError(),
          variant: "error",
        });
      }

      return;
    }

    const sourcePhaseId = source.droppableId;
    const destinationPhaseId = destination.droppableId;
    const previousPhases = roadmapPhases;
    const nextPhases = moveEventBetweenPhases(
      previousPhases,
      sourcePhaseId,
      destinationPhaseId,
      source.index,
      destination.index
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
      }
    } catch (error) {
      setRoadmapPhases(previousPhases);
      pushToast({
        message: error instanceof Error ? error.message : mapRoadmapMutationError(),
        variant: "error",
      });
    }
  }

  const totalEvents = roadmapPhases.reduce((sum, phase) => sum + phase.events.length, 0);

  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex w-full items-center justify-between gap-3 text-base">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse roadmap" : "Expand roadmap"}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              <span>Roadmap</span>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs text-muted-foreground">
              {roadmapPhases.length} milestone{roadmapPhases.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="hidden rounded-full px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
              {totalEvents} event{totalEvents === 1 ? "" : "s"}
            </Badge>
          </div>

          {canEdit ? (
            <Button type="button" className="rounded-full px-4" onClick={openCreatePhase}>
              <PlusSquare className="h-4 w-4" />
              New milestone
            </Button>
          ) : null}
        </CardTitle>
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
                Build the project journey milestone by milestone, then add the events that make
                each phase concrete.
              </p>
              {canEdit ? (
                <Button type="button" className="mt-5 rounded-full px-4" onClick={openCreatePhase}>
                  <PlusSquare className="h-4 w-4" />
                  Create the first milestone
                </Button>
              ) : null}
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div
                className={cn(
                  isDesktopLayout &&
                    "overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.52)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(148,163,184,0.14)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]"
                )}
              >
                <Droppable
                  droppableId="roadmap-phase-list"
                  type="ROADMAP_PHASE"
                  direction={isDesktopLayout ? "horizontal" : "vertical"}
                  isDropDisabled={!canEdit}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "gap-5",
                        isDesktopLayout ? "flex min-w-max items-start px-2 py-3" : "grid"
                      )}
                    >
                      {roadmapPhases.map((phase, phaseIndex) => (
                        <RoadmapPhaseCard
                          key={phase.id}
                          phase={phase}
                          phaseIndex={phaseIndex}
                          totalPhases={roadmapPhases.length}
                          canEdit={canEdit}
                          isDesktop={isDesktopLayout}
                          onCreateEvent={openCreateEvent}
                          onViewEvent={setSelectedEventId}
                          onEditPhase={openEditPhase}
                          onEditEvent={openEditEvent}
                          onDeletePhase={setPendingDeletePhaseId}
                          onDeleteEvent={setPendingDeleteEventId}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </DragDropContext>
          )}
        </CardContent>
      ) : null}

      <RoadmapDialogShell
        title={phaseDialog?.mode === "create" ? "New milestone" : "Edit milestone"}
        subtitle="Milestones act as roadmap phases. Add events inside them once the phase exists."
        isOpen={phaseDialog !== null}
        onClose={closePhaseDialog}
      >
        <RoadmapEntityForm
          draft={phaseDraft}
          title={phaseDialog?.mode === "create" ? "Create milestone" : "Update milestone"}
          subtitle="Describe the phase this project is moving through."
          submitLabel={phaseDialog?.mode === "create" ? "Create milestone" : "Save milestone"}
          targetDateLabel="Milestone date"
          statusLabel="Milestone status"
          isSubmitting={isSubmittingPhase}
          error={phaseMutationError}
          onChange={setPhaseDraft}
          onSubmit={submitPhase}
          onCancel={closePhaseDialog}
        />
      </RoadmapDialogShell>

      <RoadmapDialogShell
        title={eventDialog?.mode === "create" ? "New event" : "Edit event"}
        subtitle={
          eventDialog
            ? `This event belongs to ${
                roadmapPhases.find((phase) => phase.id === eventDialog.phaseId)?.title ?? "the selected milestone"
              }.`
            : undefined
        }
        isOpen={eventDialog !== null}
        onClose={closeEventDialog}
      >
        <RoadmapEntityForm
          draft={eventDraft}
          title={eventDialog?.mode === "create" ? "Create event" : "Update event"}
          subtitle="Capture a meaningful moment inside the milestone."
          submitLabel={eventDialog?.mode === "create" ? "Create event" : "Save event"}
          targetDateLabel="Event date"
          statusLabel="Event status"
          isSubmitting={isSubmittingEvent}
          error={eventMutationError}
          onChange={setEventDraft}
          onSubmit={submitEvent}
          onCancel={closeEventDialog}
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
        isOpen={pendingDeletePhase !== null}
        title="Delete roadmap milestone?"
        description={
          pendingDeletePhase
            ? `Delete ${pendingDeletePhase.title}? Its events will be deleted too.`
            : "Delete this roadmap milestone?"
        }
        confirmLabel={isDeletingPhase ? "Deleting..." : "Delete"}
        isConfirming={isDeletingPhase}
        onConfirm={confirmDeletePhase}
        onCancel={() => setPendingDeletePhaseId(null)}
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
