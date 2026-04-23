"use client";

import { type CSSProperties, startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Eye,
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
  getRoadmapMilestoneStatusLabel,
  ROADMAP_MILESTONE_STATUSES,
  type ProjectRoadmapMilestone,
  type RoadmapMilestoneStatus,
} from "@/lib/roadmap-milestone";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

export type ProjectRoadmapPanelMilestone = ProjectRoadmapMilestone;

interface ProjectRoadmapPanelProps {
  projectId: string;
  canEdit: boolean;
  milestones: ProjectRoadmapPanelMilestone[];
  loadError?: string | null;
}

interface RoadmapDraftState {
  title: string;
  description: string;
  targetDate: string;
  status: RoadmapMilestoneStatus;
}

const DEFAULT_DRAFT_STATE: RoadmapDraftState = {
  title: "",
  description: "",
  targetDate: "",
  status: "planned",
};

const ROADMAP_DESCRIPTION_PREVIEW_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4,
  overflow: "hidden",
} satisfies CSSProperties;

function cloneDraftState(
  milestone?: ProjectRoadmapPanelMilestone | null
): RoadmapDraftState {
  if (!milestone) {
    return { ...DEFAULT_DRAFT_STATE };
  }

  return {
    title: milestone.title,
    description: milestone.description ?? "",
    targetDate: milestone.targetDate ?? "",
    status: milestone.status,
  };
}

function mapRoadmapMutationError(errorCode: string): string {
  switch (errorCode) {
    case "roadmap-title-too-short":
      return "Milestone title must be at least 2 characters.";
    case "roadmap-title-too-long":
      return "Milestone title must be 100 characters or fewer.";
    case "roadmap-description-too-long":
      return "Milestone description must be 400 characters or fewer.";
    case "roadmap-target-date-invalid":
      return "Target date must be a valid calendar date.";
    case "roadmap-status-invalid":
      return "Milestone status is invalid.";
    case "roadmap-milestone-not-found":
      return "Roadmap milestone not found.";
    case "roadmap-milestones-invalid":
      return "Roadmap order could not be saved because one or more milestones are invalid.";
    case "roadmap-milestone-create-failed":
      return "Could not create roadmap milestone. Please retry.";
    case "roadmap-milestone-update-failed":
      return "Could not update roadmap milestone. Please retry.";
    case "roadmap-milestone-delete-failed":
      return "Could not delete roadmap milestone. Please retry.";
    case "roadmap-milestones-reorder-failed":
      return "Could not save roadmap order. Please retry.";
    default:
      return "Could not save roadmap changes. Please retry.";
  }
}

function getRoadmapStatusClasses(status: RoadmapMilestoneStatus) {
  if (status === "reached") {
    return {
      accent: "text-emerald-700 dark:text-emerald-200",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
      dot: "border-emerald-500/40 bg-emerald-500",
      card:
        "border-emerald-500/25 bg-[linear-gradient(160deg,rgba(16,185,129,0.12),rgba(255,255,255,0.72))] dark:bg-[linear-gradient(160deg,rgba(16,185,129,0.2),rgba(15,23,42,0.82))]",
      glow: "from-emerald-500/30 via-emerald-400/10 to-transparent",
    };
  }

  if (status === "active") {
    return {
      accent: "text-amber-700 dark:text-amber-200",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      dot: "border-amber-500/40 bg-amber-500",
      card:
        "border-amber-500/25 bg-[linear-gradient(160deg,rgba(245,158,11,0.12),rgba(255,255,255,0.72))] dark:bg-[linear-gradient(160deg,rgba(245,158,11,0.18),rgba(15,23,42,0.82))]",
      glow: "from-amber-500/25 via-amber-400/10 to-transparent",
    };
  }

  return {
    accent: "text-sky-700 dark:text-sky-200",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
    dot: "border-sky-500/40 bg-sky-500",
    card:
      "border-sky-500/25 bg-[linear-gradient(160deg,rgba(14,165,233,0.1),rgba(255,255,255,0.72))] dark:bg-[linear-gradient(160deg,rgba(14,165,233,0.16),rgba(15,23,42,0.82))]",
    glow: "from-sky-500/25 via-sky-400/10 to-transparent",
  };
}

function RoadmapStatusBadge({ status }: { status: RoadmapMilestoneStatus }) {
  const tone = getRoadmapStatusClasses(status);

  return (
    <Badge variant="outline" className={tone.badge}>
      {getRoadmapMilestoneStatusLabel(status)}
    </Badge>
  );
}

const ROADMAP_ACTION_BUTTON_CLASS =
  "rounded-full border border-transparent bg-transparent text-foreground/90 hover:border-slate-950 hover:bg-slate-950 hover:text-white dark:text-white/90 dark:hover:border-white dark:hover:bg-white dark:hover:text-slate-950";

function RoadmapMilestoneDescriptionPreview({
  description,
}: {
  description: string | null;
}) {
  if (!description) {
    return (
      <p className="text-sm italic text-muted-foreground">
        No extra note attached to this milestone yet.
      </p>
    );
  }

  return (
    <p
      className="break-words text-sm leading-6 text-muted-foreground"
      style={ROADMAP_DESCRIPTION_PREVIEW_STYLE}
    >
      {description}
    </p>
  );
}

function RoadmapDraftForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
  error,
}: {
  draft: RoadmapDraftState;
  onChange: (nextDraft: RoadmapDraftState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-4 rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.45)]">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{submitLabel}</h3>
        <p className="text-xs text-muted-foreground">
          Capture the milestone as a directional moment, not a task checklist.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="roadmap-title" className="text-sm font-medium">
            Title
          </label>
          <EmojiInputField
            id="roadmap-title"
            value={draft.title}
            onChange={(event) =>
              onChange({
                ...draft,
                title: event.target.value,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Private beta opens"
            maxLength={100}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="roadmap-target-date" className="text-sm font-medium">
              Target date
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
            id="roadmap-target-date"
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
          <p className="text-xs text-muted-foreground">
            Optional. Use this when the milestone has a meaningful target moment.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        <div className="grid gap-2">
          <label htmlFor="roadmap-description" className="text-sm font-medium">
            Description
          </label>
          <EmojiTextareaField
            id="roadmap-description"
            value={draft.description}
            onChange={(event) =>
              onChange({
                ...draft,
                description: event.target.value,
              })
            }
            className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Describe why this milestone matters and what it signals for the project."
            maxLength={400}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="roadmap-status" className="text-sm font-medium">
            Visual state
          </label>
          <select
            id="roadmap-status"
            value={draft.status}
            onChange={(event) =>
              onChange({
                ...draft,
                status: event.target.value as RoadmapMilestoneStatus,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={isSubmitting}
          >
            {ROADMAP_MILESTONE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getRoadmapMilestoneStatusLabel(status)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            This is manual for v1 and helps the roadmap read clearly.
          </p>
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
    </section>
  );
}

function DesktopRoadmapTimeline({
  milestones,
  canEdit,
  editingMilestoneId,
  onView,
  onStartEdit,
  onDelete,
  onMove,
}: {
  milestones: ProjectRoadmapPanelMilestone[];
  canEdit: boolean;
  editingMilestoneId: string | null;
  onView: (milestoneId: string) => void;
  onStartEdit: (milestone: ProjectRoadmapPanelMilestone) => void;
  onDelete: (milestoneId: string) => void;
  onMove: (milestoneId: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="hidden lg:block">
      <div className="overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.52)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(148,163,184,0.14)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]">
        <div className="flex min-w-max items-stretch gap-2 px-2 py-3">
          {milestones.map((milestone, index) => {
            const tone = getRoadmapStatusClasses(milestone.status);
            const isEditing = editingMilestoneId === milestone.id;

            return (
              <div key={milestone.id} className="w-[19rem] shrink-0 space-y-3">
                  <div className="flex items-center gap-3 pl-1">
                    <span
                      className={cn(
                        "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-background shadow-sm",
                        tone.dot
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="min-w-0 space-y-1">
                        <p
                          className={cn(
                            "text-[11px] font-medium uppercase tracking-[0.22em]",
                            tone.accent
                          )}
                        >
                          Milestone {index + 1}
                        </p>
                        <RoadmapStatusBadge status={milestone.status} />
                      </div>

                      {index < milestones.length - 1 ? (
                        <div className="h-0.5 min-w-10 flex-1 rounded-full bg-border/75" />
                      ) : null}
                    </div>
                  </div>

                  <article
                    className={cn(
                      "relative overflow-hidden rounded-[1.8rem] border p-4 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.55)] backdrop-blur-sm transition",
                      tone.card,
                      isEditing ? "ring-1 ring-primary/30" : ""
                    )}
                  >
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
                        tone.glow
                      )}
                    />
                    <div className="relative space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <h3 className="break-words text-lg font-semibold leading-6 text-foreground">
                            {milestone.title}
                          </h3>
                          {milestone.targetDate ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatRoadmapTargetDateForDisplay(milestone.targetDate)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-dashed border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                              No target date
                            </span>
                          )}
                        </div>
                        {canEdit ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() => onMove(milestone.id, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${milestone.title} earlier`}
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() => onMove(milestone.id, 1)}
                              disabled={index === milestones.length - 1}
                              aria-label={`Move ${milestone.title} later`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <RoadmapMilestoneDescriptionPreview description={milestone.description} />

                      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={ROADMAP_ACTION_BUTTON_CLASS}
                          onClick={() => onView(milestone.id)}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>

                        {canEdit ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={ROADMAP_ACTION_BUTTON_CLASS}
                              onClick={() => onStartEdit(milestone)}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={ROADMAP_ACTION_BUTTON_CLASS}
                              onClick={() => onDelete(milestone.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileRoadmapTimeline({
  milestones,
  canEdit,
  editingMilestoneId,
  onView,
  onStartEdit,
  onDelete,
  onMove,
}: {
  milestones: ProjectRoadmapPanelMilestone[];
  canEdit: boolean;
  editingMilestoneId: string | null;
  onView: (milestoneId: string) => void;
  onStartEdit: (milestone: ProjectRoadmapPanelMilestone) => void;
  onDelete: (milestoneId: string) => void;
  onMove: (milestoneId: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="grid gap-4 lg:hidden">
      {milestones.map((milestone, index) => {
        const tone = getRoadmapStatusClasses(milestone.status);
        const isEditing = editingMilestoneId === milestone.id;

        return (
          <div key={milestone.id} className="relative pl-8">
            {index < milestones.length - 1 ? (
              <div className="absolute bottom-[-1.25rem] left-[0.55rem] top-7 w-px bg-[linear-gradient(180deg,rgba(148,163,184,0.7),rgba(148,163,184,0.18))]" />
            ) : null}
            <span
              className={cn(
                "absolute left-0 top-4 flex h-5 w-5 items-center justify-center rounded-full border-4 border-background shadow-sm",
                tone.dot
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
            </span>

            <article
              className={cn(
                "overflow-hidden rounded-[1.6rem] border p-4 shadow-[0_22px_60px_-46px_rgba(15,23,42,0.45)]",
                tone.card,
                isEditing ? "ring-1 ring-primary/30" : ""
              )}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-[0.22em]",
                        tone.accent
                      )}
                    >
                      Milestone {index + 1}
                    </p>
                    <RoadmapStatusBadge status={milestone.status} />
                  </div>

                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => onMove(milestone.id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${milestone.title} earlier`}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => onMove(milestone.id, 1)}
                        disabled={index === milestones.length - 1}
                        aria-label={`Move ${milestone.title} later`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                <h3 className="break-words text-base font-semibold text-foreground">
                  {milestone.title}
                </h3>

                {milestone.targetDate ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatRoadmapTargetDateForDisplay(milestone.targetDate)}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-dashed border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                    No target date
                  </span>
                )}

                <RoadmapMilestoneDescriptionPreview description={milestone.description} />

                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={ROADMAP_ACTION_BUTTON_CLASS}
                    onClick={() => onView(milestone.id)}
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
                        onClick={() => onStartEdit(milestone)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={ROADMAP_ACTION_BUTTON_CLASS}
                        onClick={() => onDelete(milestone.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function RoadmapMilestoneDetailModal({
  milestone,
  milestoneIndex,
  milestonesCount,
  canEdit,
  isOpen,
  onClose,
  onStartEdit,
  onDelete,
  onMove,
}: {
  milestone: ProjectRoadmapPanelMilestone | null;
  milestoneIndex: number;
  milestonesCount: number;
  canEdit: boolean;
  isOpen: boolean;
  onClose: () => void;
  onStartEdit: (milestone: ProjectRoadmapPanelMilestone) => void;
  onDelete: (milestoneId: string) => void;
  onMove: (milestoneId: string, direction: -1 | 1) => void;
}) {
  if (!isOpen || !milestone) {
    return null;
  }

  const tone = getRoadmapStatusClasses(milestone.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/55 p-3 sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label="Close milestone details"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-milestone-dialog-title"
        className={cn(
          "relative z-10 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-border/70 bg-background shadow-[0_35px_100px_-40px_rgba(15,23,42,0.6)]",
          tone.card
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
            tone.glow
          )}
        />

        <div className="relative space-y-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em]",
                    tone.accent
                  )}
                >
                  Milestone {milestoneIndex + 1}
                </span>
                <RoadmapStatusBadge status={milestone.status} />
              </div>
              <h3
                id="roadmap-milestone-dialog-title"
                className="break-words text-2xl font-semibold leading-tight text-foreground"
              >
                {milestone.title}
              </h3>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={onClose}
              aria-label="Close milestone details"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Target date
              </p>
              {milestone.targetDate ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {formatRoadmapTargetDateForDisplay(milestone.targetDate)}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-dashed border-border/60 bg-background/65 px-3 py-1 text-sm text-muted-foreground">
                  No target date
                </span>
              )}
            </div>

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onMove(milestone.id, -1)}
                  disabled={milestoneIndex === 0}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Earlier
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onMove(milestone.id, 1)}
                  disabled={milestoneIndex === milestonesCount - 1}
                >
                  <ArrowRight className="h-4 w-4" />
                  Later
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-[1.4rem] border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Description
            </p>
            {milestone.description ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/85">
                {milestone.description}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No extra note attached to this milestone yet.
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className={ROADMAP_ACTION_BUTTON_CLASS}
                  onClick={() => {
                    onStartEdit(milestone);
                    onClose();
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={ROADMAP_ACTION_BUTTON_CLASS}
                  onClick={() => {
                    onDelete(milestone.id);
                    onClose();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectRoadmapPanel({
  projectId,
  canEdit,
  milestones,
  loadError = null,
}: ProjectRoadmapPanelProps) {
  const router = useRouter();
  const { pushToast } = useToast();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "roadmap",
    defaultExpanded: true,
    logLabel: "ProjectRoadmapPanel",
  });
  const [localMilestones, setLocalMilestones] = useState<ProjectRoadmapPanelMilestone[]>(
    milestones
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<RoadmapDraftState>({
    ...DEFAULT_DRAFT_STATE,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RoadmapDraftState>({
    ...DEFAULT_DRAFT_STATE,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeleteMilestoneId, setPendingDeleteMilestoneId] = useState<string | null>(null);
  const [viewMilestoneId, setViewMilestoneId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reorderingMilestoneId, setReorderingMilestoneId] = useState<string | null>(null);

  useEffect(() => {
    setLocalMilestones(milestones);
  }, [milestones]);

  const pendingDeleteMilestone = useMemo(
    () =>
      localMilestones.find((milestone) => milestone.id === pendingDeleteMilestoneId) ?? null,
    [localMilestones, pendingDeleteMilestoneId]
  );

  const viewedMilestone = useMemo(
    () => localMilestones.find((milestone) => milestone.id === viewMilestoneId) ?? null,
    [localMilestones, viewMilestoneId]
  );

  const viewedMilestoneIndex = useMemo(
    () =>
      viewedMilestone
        ? localMilestones.findIndex((milestone) => milestone.id === viewedMilestone.id)
        : -1,
    [localMilestones, viewedMilestone]
  );

  const refreshProjectData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const resetCreateDraft = () => {
    setCreateDraft({ ...DEFAULT_DRAFT_STATE });
    setCreateError(null);
  };

  const closeCreate = (force = false) => {
    if (isCreating && !force) {
      return;
    }

    setIsCreateOpen(false);
    resetCreateDraft();
  };

  const startEdit = (milestone: ProjectRoadmapPanelMilestone) => {
    setEditingMilestoneId(milestone.id);
    setEditDraft(cloneDraftState(milestone));
    setEditError(null);
  };

  const cancelEdit = (force = false) => {
    if (isSavingEdit && !force) {
      return;
    }

    setEditingMilestoneId(null);
    setEditDraft({ ...DEFAULT_DRAFT_STATE });
    setEditError(null);
  };

  const handleCreateMilestone = async () => {
    const normalizedTitle = createDraft.title.trim();
    if (!normalizedTitle) {
      setCreateError("Milestone title is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/roadmap-milestones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: normalizedTitle,
          description: createDraft.description,
          targetDate: createDraft.targetDate || null,
          status: createDraft.status,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; milestone?: ProjectRoadmapPanelMilestone }
        | null;

      if (!response.ok || !payload?.milestone) {
        throw new Error(
          mapRoadmapMutationError(payload?.error ?? "roadmap-milestone-create-failed")
        );
      }

      setLocalMilestones((previousMilestones) =>
        [...previousMilestones, payload.milestone!].sort(
          (left, right) => left.position - right.position
        )
      );
      closeCreate(true);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Roadmap milestone created.",
      });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create roadmap milestone."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveMilestone = async () => {
    if (!editingMilestoneId) {
      return;
    }

    const normalizedTitle = editDraft.title.trim();
    if (!normalizedTitle) {
      setEditError("Milestone title is required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/roadmap-milestones/${editingMilestoneId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: normalizedTitle,
            description: editDraft.description,
            targetDate: editDraft.targetDate || null,
            status: editDraft.status,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; milestone?: ProjectRoadmapPanelMilestone }
        | null;

      if (!response.ok || !payload?.milestone) {
        throw new Error(
          mapRoadmapMutationError(payload?.error ?? "roadmap-milestone-update-failed")
        );
      }

      const updatedMilestone = payload.milestone;
      setLocalMilestones((previousMilestones) =>
        previousMilestones.map((milestone) =>
          milestone.id === updatedMilestone.id ? updatedMilestone : milestone
        )
      );
      cancelEdit(true);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Roadmap milestone updated.",
      });
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not update roadmap milestone."
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteMilestone = async () => {
    if (!pendingDeleteMilestone || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/roadmap-milestones/${pendingDeleteMilestone.id}`,
        {
          method: "DELETE",
        }
      );

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(
          mapRoadmapMutationError(payload?.error ?? "roadmap-milestone-delete-failed")
        );
      }

      setLocalMilestones((previousMilestones) =>
        previousMilestones.filter((milestone) => milestone.id !== pendingDeleteMilestone.id)
      );
      if (viewMilestoneId === pendingDeleteMilestone.id) {
        setViewMilestoneId(null);
      }
      setPendingDeleteMilestoneId(null);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Roadmap milestone deleted.",
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Could not delete roadmap milestone.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveMilestone = async (milestoneId: string, direction: -1 | 1) => {
    if (!canEdit || reorderingMilestoneId) {
      return;
    }

    const currentIndex = localMilestones.findIndex((milestone) => milestone.id === milestoneId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= localMilestones.length) {
      return;
    }

    const reorderedMilestones = localMilestones.slice();
    const [movedMilestone] = reorderedMilestones.splice(currentIndex, 1);
    if (!movedMilestone) {
      return;
    }
    reorderedMilestones.splice(nextIndex, 0, movedMilestone);

    const normalizedReorderedMilestones = reorderedMilestones.map((milestone, index) => ({
      ...milestone,
      position: index,
    }));
    const previousMilestones = localMilestones;
    setLocalMilestones(normalizedReorderedMilestones);
    setReorderingMilestoneId(milestoneId);

    try {
      const response = await fetch(`/api/projects/${projectId}/roadmap-milestones/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          milestoneIds: normalizedReorderedMilestones.map((milestone) => milestone.id),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(
          mapRoadmapMutationError(payload?.error ?? "roadmap-milestones-reorder-failed")
        );
      }

      refreshProjectData();
    } catch (error) {
      setLocalMilestones(previousMilestones);
      pushToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Could not save roadmap order.",
      });
    } finally {
      setReorderingMilestoneId(null);
    }
  };

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
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
              {localMilestones.length} milestone{localMilestones.length === 1 ? "" : "s"}
            </span>
          </button>

          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                resetCreateDraft();
                setIsExpanded(true);
                setIsCreateOpen(true);
              }}
            >
              <PlusSquare className="h-4 w-4" />
              New milestone
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-5", PROJECT_SECTION_CONTENT_CLASS)}>
          {loadError ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
              {loadError}
            </div>
          ) : null}

          {isCreateOpen ? (
            <RoadmapDraftForm
              draft={createDraft}
              onChange={setCreateDraft}
              onSubmit={() => void handleCreateMilestone()}
              onCancel={() => closeCreate()}
              submitLabel="Create milestone"
              isSubmitting={isCreating}
              error={createError}
            />
          ) : null}

          {editingMilestoneId ? (
            <RoadmapDraftForm
              draft={editDraft}
              onChange={setEditDraft}
              onSubmit={() => void handleSaveMilestone()}
              onCancel={() => cancelEdit()}
              submitLabel="Save milestone"
              isSubmitting={isSavingEdit}
              error={editError}
            />
          ) : null}

          {localMilestones.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">No roadmap milestones yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add the major moments ahead so the project reads like a journey, not just a list
                of tasks.
              </p>
            </div>
          ) : (
            <>
              <DesktopRoadmapTimeline
                milestones={localMilestones}
                canEdit={canEdit}
                editingMilestoneId={editingMilestoneId}
                onView={setViewMilestoneId}
                onStartEdit={startEdit}
                onDelete={(milestoneId) => setPendingDeleteMilestoneId(milestoneId)}
                onMove={(milestoneId, direction) =>
                  void handleMoveMilestone(milestoneId, direction)
                }
              />
              <MobileRoadmapTimeline
                milestones={localMilestones}
                canEdit={canEdit}
                editingMilestoneId={editingMilestoneId}
                onView={setViewMilestoneId}
                onStartEdit={startEdit}
                onDelete={(milestoneId) => setPendingDeleteMilestoneId(milestoneId)}
                onMove={(milestoneId, direction) =>
                  void handleMoveMilestone(milestoneId, direction)
                }
              />
            </>
          )}
        </CardContent>
      ) : null}

      <RoadmapMilestoneDetailModal
        milestone={viewedMilestone}
        milestoneIndex={viewedMilestoneIndex}
        milestonesCount={localMilestones.length}
        canEdit={canEdit}
        isOpen={Boolean(viewedMilestone)}
        onClose={() => setViewMilestoneId(null)}
        onStartEdit={startEdit}
        onDelete={(milestoneId) => setPendingDeleteMilestoneId(milestoneId)}
        onMove={(milestoneId, direction) => void handleMoveMilestone(milestoneId, direction)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteMilestone)}
        title="Delete roadmap milestone?"
        description={
          pendingDeleteMilestone
            ? `Delete "${pendingDeleteMilestone.title}" from the roadmap? This removes the milestone from the project journey.`
            : ""
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete milestone"}
        onConfirm={() => void handleDeleteMilestone()}
        onCancel={() => {
          if (isDeleting) {
            return;
          }

          setPendingDeleteMilestoneId(null);
        }}
        isConfirming={isDeleting}
      />
    </Card>
  );
}
