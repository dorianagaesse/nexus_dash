"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
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
const CONNECTOR_TOP_OFFSET = 106;

const ROADMAP_ACTION_BUTTON_CLASS =
  "rounded-full border border-transparent bg-transparent text-foreground/90 hover:border-slate-950 hover:bg-slate-950 hover:text-white dark:text-white/90 dark:hover:border-white dark:hover:bg-white dark:hover:text-slate-950";

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
  extraFields,
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
  extraFields?: ReactNode;
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

      {extraFields ? <div className="grid gap-2">{extraFields}</div> : null}

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

  const content = (
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

function getLaneCardCenterY(eventIndex: number): number {
  return (
    CONNECTOR_TOP_OFFSET +
    eventIndex * (CONNECTOR_CARD_HEIGHT + CONNECTOR_CARD_GAP) +
    CONNECTOR_CARD_HEIGHT / 2
  );
}

function getLaneConnectorAnchorY(eventsCount: number): number {
  if (eventsCount <= 1) {
    return getLaneCardCenterY(0);
  }

  return (
    CONNECTOR_TOP_OFFSET +
    ((eventsCount - 1) * (CONNECTOR_CARD_HEIGHT + CONNECTOR_CARD_GAP) +
      CONNECTOR_CARD_HEIGHT) /
      2
  );
}

function getLaneConnectorHeight(
  currentPhase: ProjectRoadmapPanelPhase,
  nextPhase: ProjectRoadmapPanelPhase
): number {
  const currentHeight = getLaneCardCenterY(Math.max(currentPhase.events.length - 1, 0));
  const nextHeight = getLaneCardCenterY(Math.max(nextPhase.events.length - 1, 0));
  return Math.max(currentHeight, nextHeight) + CONNECTOR_CARD_HEIGHT / 2;
}

function buildConnectorPath(width: number, startY: number, endY: number): string {
  const controlOffset = Math.max(width * 0.32, 22);
  return `M 0 ${startY} C ${controlOffset} ${startY}, ${width - controlOffset} ${endY}, ${width} ${endY}`;
}

function RoadmapDesktopConnector({
  currentPhase,
  nextPhase,
}: {
  currentPhase: ProjectRoadmapPanelPhase;
  nextPhase: ProjectRoadmapPanelPhase;
}) {
  const height = getLaneConnectorHeight(currentPhase, nextPhase);
  const width = 92;
  const startY = getLaneConnectorAnchorY(currentPhase.events.length);
  const targetIndexes =
    nextPhase.events.length === 0
      ? [0]
      : nextPhase.events.map((_, eventIndex) => eventIndex);

  return (
    <div
      aria-hidden="true"
      className="relative hidden w-[5.75rem] shrink-0 lg:block"
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        fill="none"
      >
        {targetIndexes.map((eventIndex) => (
          <path
            key={eventIndex}
            d={buildConnectorPath(width, startY, getLaneCardCenterY(eventIndex))}
            stroke="rgb(148 163 184 / 0.58)"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

function RoadmapEventCard({
  event,
  phaseIndex,
  eventIndex,
  canEdit,
  onView,
  onEdit,
  onDelete,
}: {
  event: ProjectRoadmapPanelEvent;
  phaseIndex: number;
  eventIndex: number;
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
            "relative min-h-[212px] rounded-[1.55rem] border p-4 shadow-[0_24px_64px_-46px_rgba(15,23,42,0.58)] transition",
            tone.phaseCard,
            snapshot.isDragging && "z-20 shadow-[0_32px_90px_-42px_rgba(15,23,42,0.7)] ring-1 ring-primary/20"
          )}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-[0.2em]",
                      tone.accent
                    )}
                  >
                    {getMilestoneLabel(phaseIndex)} / Event {eventIndex + 1}
                  </span>
                  <RoadmapStatusBadge status={event.status} />
                </div>
                <h4 className="break-words text-lg font-semibold text-foreground">
                  {event.title}
                </h4>
              </div>

              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full border border-border/40 bg-background/70 text-muted-foreground backdrop-blur-sm hover:bg-background"
                  aria-label={`Drag ${event.title}`}
                  {...provided.dragHandleProps}
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
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
      )}
    </Draggable>
  );
}

function RoadmapMilestoneLane({
  phase,
  phaseIndex,
  canEdit,
  isDesktop,
  onViewEvent,
  onEditEvent,
  onDeleteEvent,
}: {
  phase: ProjectRoadmapPanelPhase;
  phaseIndex: number;
  canEdit: boolean;
  isDesktop: boolean;
  onViewEvent: (eventId: string) => void;
  onEditEvent: (event: ProjectRoadmapPanelEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}) {
  const milestoneLabel = getMilestoneLabel(phaseIndex);

  return (
    <section
      className={cn("relative shrink-0", isDesktop ? ROADMAP_LANE_WIDTH_CLASS : "w-full")}
      data-roadmap-milestone={phaseIndex + 1}
    >
      <div className="mb-4 flex items-center gap-3 px-1">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-background bg-slate-400 shadow-sm dark:bg-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            {milestoneLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getEventCountLabel(phase.events.length)}
          </p>
        </div>
      </div>

      <Droppable droppableId={phase.id} type="ROADMAP_EVENT" isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "space-y-4 rounded-[1.7rem] border border-border/65 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.12),transparent_36%),rgba(255,255,255,0.72)] p-4 shadow-[0_24px_74px_-56px_rgba(15,23,42,0.58)] transition dark:bg-[radial-gradient(circle_at_top_left,rgba(71,85,105,0.22),transparent_36%),rgba(15,23,42,0.45)]",
              snapshot.isDraggingOver &&
                "border-slate-500/70 bg-[radial-gradient(circle_at_top_left,rgba(100,116,139,0.22),transparent_34%),rgba(226,232,240,0.86)] dark:bg-[radial-gradient(circle_at_top_left,rgba(71,85,105,0.36),transparent_34%),rgba(15,23,42,0.8)]"
            )}
          >
            {phase.events.length === 0 ? (
              <div className="flex min-h-[212px] items-center justify-center rounded-[1.4rem] border border-dashed border-border/55 bg-background/70 px-5 py-8 text-center">
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
                  phaseIndex={phaseIndex}
                  eventIndex={eventIndex}
                  canEdit={canEdit}
                  onView={onViewEvent}
                  onEdit={onEditEvent}
                  onDelete={onDeleteEvent}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}

function RoadmapNewMilestoneDropLane({
  canEdit,
  isDesktop,
}: {
  canEdit: boolean;
  isDesktop: boolean;
}) {
  if (!canEdit) {
    return null;
  }

  return (
    <section className={cn("relative shrink-0", isDesktop ? ROADMAP_LANE_WIDTH_CLASS : "w-full")}>
      <div className="mb-4 flex items-center gap-3 px-1">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-background bg-slate-300 shadow-sm dark:bg-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            New milestone
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Drop here to create a new lane</p>
        </div>
      </div>

      <Droppable droppableId={NEW_MILESTONE_DROP_ID} type="ROADMAP_EVENT" isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex min-h-[292px] items-center justify-center rounded-[1.7rem] border border-dashed border-border/70 bg-background/55 px-6 py-8 text-center shadow-[0_24px_74px_-56px_rgba(15,23,42,0.58)] transition",
              snapshot.isDraggingOver &&
                "border-slate-600/75 bg-slate-200/90 dark:border-slate-400/80 dark:bg-slate-900/80"
            )}
          >
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Create the next milestone</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Drag an event here to place it in a brand new milestone lane.
              </p>
            </div>
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

  useEffect(() => {
    setRoadmapPhases(sortRoadmapPhasesForDisplay(phases));
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

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;

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
            <Button type="button" className="rounded-full px-4" onClick={openCreateEvent}>
              <PlusSquare className="h-4 w-4" />
              New event
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
            <DragDropContext onDragEnd={handleDragEnd}>
              <div
                className={cn(
                  isDesktopLayout &&
                    "overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.52)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(148,163,184,0.14)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]"
                )}
              >
                <div
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
                        onViewEvent={setSelectedEventId}
                        onEditEvent={openEditEvent}
                        onDeleteEvent={setPendingDeleteEventId}
                      />
                      {isDesktopLayout && phaseIndex < roadmapPhases.length - 1 ? (
                        <RoadmapDesktopConnector
                          currentPhase={phase}
                          nextPhase={roadmapPhases[phaseIndex + 1]}
                        />
                      ) : null}
                    </div>
                  ))}
                  <RoadmapNewMilestoneDropLane
                    canEdit={canEdit}
                    isDesktop={isDesktopLayout}
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
          extraFields={
            eventDialog?.mode === "create" ? (
              <>
                <label htmlFor="roadmap-event-target-milestone" className="text-sm font-medium">
                  Milestone placement
                </label>
                <select
                  id="roadmap-event-target-milestone"
                  value={eventDialog.targetPhaseId}
                  onChange={(selectEvent) =>
                    setEventDialog((currentDialog) =>
                      currentDialog
                        ? {
                            ...currentDialog,
                            targetPhaseId: selectEvent.target.value,
                          }
                        : currentDialog
                    )
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={isSubmittingEvent}
                >
                  <option value={NEW_MILESTONE_TARGET}>
                    New milestone ({createMilestoneLabel})
                  </option>
                  {roadmapPhases.map((phase, phaseIndex) => (
                    <option key={phase.id} value={phase.id}>
                      {getMilestoneLabel(phaseIndex)} ({getEventCountLabel(phase.events.length)})
                    </option>
                  ))}
                </select>
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
