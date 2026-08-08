"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Circle,
  ListTodo,
  Pencil,
  PlusSquare,
  Search,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { CalendarDateTimeField } from "@/components/calendar-date-time-field";
import { MeetingParticipantAvatar } from "@/components/meeting-participants/meeting-participant-avatar";
import { MeetingParticipantPicker } from "@/components/meeting-participants/meeting-participant-picker";
import type {
  MeetingNoteStatus,
  ProjectMeetingNotePanelAction,
  ProjectMeetingNotePanelNote,
} from "@/components/meeting-todos/meeting-note-types";
import {
  MeetingTodoAssigneeChip,
  MeetingTodoAssigneeChipReadonly,
} from "@/components/meeting-todos/meeting-todo-assignee-chip";
import { MeetingTodoActorIdentity } from "@/components/meeting-todos/meeting-todo-actor-control";
import { MeetingTodoQuickDialog } from "@/components/meeting-todos/meeting-todo-quick-dialog";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";
import { TokenInput } from "@/components/ui/token-input";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import {
  getMeetingParticipantKey,
  type ProjectMeetingParticipantCollaborator,
  type ProjectMeetingParticipantIdentity,
} from "@/lib/meeting-participant";
import {
  fetchProjectActivityMutation,
  PROJECT_ACTIVITY_REMOTE_EVENT,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";
import { buildProjectMeetingTodos, type ProjectMeetingTodo } from "@/lib/meeting-todo";
import {
  getMeetingTodoActorKey,
  type MeetingTodoActorReference,
  type MeetingTodoActorSummary,
} from "@/lib/meeting-todo-actor";
import {
  getTaskLabelColor,
  MAX_TASK_LABELS,
  normalizeTaskLabel,
} from "@/lib/task-label";
import { cn } from "@/lib/utils";

type MeetingListView = "active" | "archived";
type PrepareDialogMode = "create" | "edit";

interface ProjectMeetingNotesPanelProps {
  projectId: string;
  canEdit: boolean;
  currentActorUserId?: string;
  notes: ProjectMeetingNotePanelNote[];
  collaborators: ProjectMeetingParticipantCollaborator[];
  todoActors: MeetingTodoActorSummary[];
  stewardFilter?: StewardFilterValue;
  initialQuery?: string | null;
  initialMeetingNoteId?: string | null;
  initialMeetingTodoId?: string | null;
}

export type StewardFilterValue = "all" | "mine" | "unassigned";

function normalizeStewardFilter(value: string | null | undefined): StewardFilterValue {
  return value === "mine" || value === "unassigned" ? value : "all";
}

function buildNotesHref(input: {
  projectId: string;
  stewardFilter: StewardFilterValue;
  query?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.stewardFilter !== "all") {
    params.set("meetingNoteSteward", input.stewardFilter);
  }
  const trimmedQuery = (input.query ?? "").trim();
  if (trimmedQuery.length > 0) {
    params.set("meetingNoteQuery", trimmedQuery);
  }
  const query = params.toString();
  return query ? `/projects/${input.projectId}?${query}` : `/projects/${input.projectId}`;
}

interface DraftAction {
  id: string;
  content: string;
  completedAt: string | null;
  persisted: boolean;
  creator: MeetingTodoActorSummary | null;
  assignee: MeetingTodoActorSummary | null;
  completedBy: MeetingTodoActorSummary | null;
}

interface PrepareDraft {
  title: string;
  scheduledAtLocal: string;
  participants: ProjectMeetingParticipantIdentity[];
  participantInput: string;
  labels: string[];
  labelInput: string;
  inputNotes: string;
}

interface NotesDraft {
  outputNotes: string;
  status: MeetingNoteStatus;
  actions: DraftAction[];
}

interface PrepareDialogState {
  mode: PrepareDialogMode;
  noteId: string | null;
}

const EMPTY_PREPARE_DRAFT: PrepareDraft = {
  title: "",
  scheduledAtLocal: "",
  participants: [],
  participantInput: "",
  labels: [],
  labelInput: "",
  inputNotes: "",
};

const EMPTY_NOTES_DRAFT: NotesDraft = {
  outputNotes: "",
  status: "actions_in_progress",
  actions: [],
};

const STATUS_LABELS: Record<MeetingNoteStatus, string> = {
  prepared: "Prepared",
  actions_in_progress: "Actions in progress",
  done: "Done",
};

const STATUS_BADGE_CLASS: Record<MeetingNoteStatus, string> = {
  prepared:
    "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  actions_in_progress:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  done:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
};

const STATUS_OPTIONS: Array<{
  value: MeetingNoteStatus;
  label: string;
  description: string;
}> = [
  {
    value: "prepared",
    label: STATUS_LABELS.prepared,
    description: "Prepared before the meeting; notes can be added later.",
  },
  {
    value: "actions_in_progress",
    label: STATUS_LABELS.actions_in_progress,
    description: "Outputs are captured and follow-up work is still open.",
  },
  {
    value: "done",
    label: STATUS_LABELS.done,
    description: "Archive the meeting note once follow-up is complete.",
  },
];

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMeetingTime(value: string | null): string {
  if (!value) {
    return "Unscheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMeetingTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function actionCounts(note: ProjectMeetingNotePanelNote) {
  const completed = note.actions.filter((action) => action.completedAt != null).length;
  return {
    completed,
    total: note.actions.length,
  };
}

function sortNotes(notes: ProjectMeetingNotePanelNote[]): ProjectMeetingNotePanelNote[] {
  return notes.slice().sort((left, right) => {
    const leftTime = left.scheduledAt
      ? new Date(left.scheduledAt).getTime()
      : new Date(left.createdAt).getTime();
    const rightTime = right.scheduledAt
      ? new Date(right.scheduledAt).getTime()
      : new Date(right.createdAt).getTime();

    return rightTime - leftTime;
  });
}

function noteMatchesQuery(note: ProjectMeetingNotePanelNote, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchable = [
    note.title,
    ...note.participants.map((participant) => participant.displayName),
    ...note.labels,
    STATUS_LABELS[note.status],
    note.inputNotes,
    note.outputNotes,
    ...note.actions.map((action) => action.content),
  ]
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(normalizedQuery);
}

function noteMatchesLabelFilters(
  note: ProjectMeetingNotePanelNote,
  labelFilters: string[]
): boolean {
  if (labelFilters.length === 0) {
    return true;
  }

  const noteLabels = new Set(note.labels.map((label) => label.toLocaleLowerCase()));
  return labelFilters.every((label) => noteLabels.has(label.toLocaleLowerCase()));
}

function buildPrepareDraftFromNote(note: ProjectMeetingNotePanelNote): PrepareDraft {
  return {
    title: note.title,
    scheduledAtLocal: toDateTimeLocal(note.scheduledAt),
    participants: note.participants,
    participantInput: "",
    labels: note.labels,
    labelInput: "",
    inputNotes: note.inputNotes,
  };
}

function buildNotesDraftFromNote(note: ProjectMeetingNotePanelNote): NotesDraft {
  return {
    outputNotes: note.outputNotes,
    status: note.status === "prepared" ? "actions_in_progress" : note.status,
    actions: note.actions.map((action) => ({
      id: action.id,
      content: action.content,
      completedAt: action.completedAt,
      persisted: true,
      creator: action.creator ?? null,
      assignee: action.assignee ?? null,
      completedBy: action.completedBy ?? null,
    })),
  };
}

function buildParticipantPayload(
  participants: ProjectMeetingParticipantIdentity[]
) {
  return participants.map((participant) => ({
    userId: participant.userId,
    displayName: participant.displayName,
  }));
}

function buildBasePayload(note: ProjectMeetingNotePanelNote) {
  return {
    title: note.title,
    scheduledAt: note.scheduledAt,
    participants: buildParticipantPayload(note.participants),
    labels: note.labels,
    status: note.status,
    inputNotes: note.inputNotes,
    outputNotes: note.outputNotes,
    decisions: note.decisions ?? "",
    actions: note.actions,
  };
}

function mapMeetingNoteError(errorCode: string): string {
  switch (errorCode) {
    case "meeting-note-title-too-short":
      return "Meeting title must be at least 2 characters.";
    case "meeting-note-title-too-long":
      return "Meeting title must be 140 characters or fewer.";
    case "meeting-note-scheduled-at-invalid":
      return "Meeting time is not valid.";
    case "meeting-note-too-many-participants":
      return "Keep participants to 40 people or fewer.";
    case "meeting-note-participant-too-long":
      return "Participant names must be 80 characters or fewer.";
    case "meeting-note-participant-user-invalid":
      return "That NexusDash collaborator no longer has access to this project.";
    case "meeting-note-section-too-long":
      return "Meeting sections are too long.";
    case "meeting-note-too-many-actions":
      return "Keep follow-up actions to 40 items or fewer.";
    case "meeting-note-action-too-long":
      return "Follow-up actions must be 240 characters or fewer.";
    case "meeting-note-action-not-found":
      return "Meeting todo not found.";
    case "meeting-note-action-update-failed":
      return "Could not update the meeting todo. Please retry.";
    case "meeting-note-not-found":
      return "Meeting note not found.";
    case "forbidden":
      return "You do not have permission to change meeting notes.";
    default:
      return "Could not save meeting notes. Please retry.";
  }
}

function LabelPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-950"
      style={{ backgroundColor: getTaskLabelColor(label) }}
    >
      <Tag className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function MeetingStatusSelect({
  id,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  value: MeetingNoteStatus;
  disabled?: boolean;
  onChange: (value: MeetingNoteStatus) => void;
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
  const selectedOption =
    STATUS_OPTIONS.find((option) => option.value === value) ?? STATUS_OPTIONS[0];

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
      const estimatedHeight = Math.min(78 * STATUS_OPTIONS.length, 300);
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const shouldOpenAbove =
        availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        160,
        shouldOpenAbove ? availableAbove - 8 : availableBelow - 8
      );
      const width = Math.min(
        Math.max(rect.width, 280),
        window.innerWidth - viewportPadding * 2
      );
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
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label="Meeting state"
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[11px]", STATUS_BADGE_CLASS[value])}
            >
              {selectedOption.label}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {selectedOption.description}
          </p>
        </div>
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
              data-overlay-popover="true"
              className="pointer-events-auto z-[140] overflow-hidden rounded-2xl border border-border/70 bg-popover p-1.5 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.58)]"
              style={{
                position: "fixed",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                maxHeight: dropdownPosition.maxHeight,
              }}
            >
              <div className="scrollbar-hidden space-y-1 overflow-y-auto p-0.5">
                {STATUS_OPTIONS.map((option) => {
                  const isSelected = option.value === value;

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
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 text-[11px]",
                              STATUS_BADGE_CLASS[option.value]
                            )}
                          >
                            {option.label}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {option.description}
                        </p>
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

function MeetingDialogShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
  dismissible = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  dismissible?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && dismissible) {
          onClose();
        }
      }}
    >
      <DialogContent
        data-calendar-popover-scope="true"
        dismissible={dismissible}
        className={cn(
          "flex max-h-[100dvh] w-full flex-col overflow-hidden border-border/70 bg-background shadow-[0_40px_120px_-44px_rgba(15,23,42,0.7)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl",
          maxWidthClassName
        )}
      >
        <div className="border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {title}
              </DialogTitle>
              {subtitle ? (
                <DialogDescription className="leading-6">{subtitle}</DialogDescription>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={onClose}
              aria-label={`Close ${title}`}
              disabled={!dismissible}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div
            data-calendar-popover-footer-boundary="true"
            className="border-t border-border/60 px-5 py-4 sm:px-6"
          >
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectMeetingNotesPanel({
  projectId,
  canEdit,
  currentActorUserId = "",
  notes,
  collaborators,
  todoActors,
  stewardFilter = "all",
  initialQuery = null,
  initialMeetingNoteId = null,
  initialMeetingTodoId = null,
}: ProjectMeetingNotesPanelProps) {
  const initialSelectedNote =
    notes.find((note) => note.id === initialMeetingNoteId) ?? null;
  const { pushToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStewardFilter = normalizeStewardFilter(
    searchParams.get("meetingNoteSteward")
  );
  const urlQuery = searchParams.get("meetingNoteQuery") ?? "";
  const activeStewardFilter = stewardFilter ?? urlStewardFilter;
  const activeQuery = initialQuery ?? urlQuery;
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "meeting-notes",
    defaultExpanded: true,
    logLabel: "ProjectMeetingNotesPanel",
  });
  const [localNotes, setLocalNotes] = useState<ProjectMeetingNotePanelNote[]>(() =>
    sortNotes(notes)
  );
  const [referenceNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState(activeQuery);
  const [selectedLabelFilters, setSelectedLabelFilters] = useState<string[]>([]);
  const [listView, setListView] = useState<MeetingListView>(
    initialSelectedNote?.status === "done" ? "archived" : "active"
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialSelectedNote?.id ?? null
  );
  const [prepareDialog, setPrepareDialog] = useState<PrepareDialogState | null>(null);
  const [prepareDraft, setPrepareDraft] =
    useState<PrepareDraft>(EMPTY_PREPARE_DRAFT);
  const [notesDraft, setNotesDraft] = useState<NotesDraft>(() =>
    initialSelectedNote
      ? buildNotesDraftFromNote(initialSelectedNote)
      : EMPTY_NOTES_DRAFT
  );
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingTodoActionId, setPendingTodoActionId] = useState<string | null>(
    null
  );
  const [pendingStewardNoteId, setPendingStewardNoteId] = useState<string | null>(
    null
  );
  const [stewardError, setStewardError] = useState<string | null>(null);
  const appliedInitialMeetingNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sortedNotes = sortNotes(notes);
    setLocalNotes(sortedNotes);
    setSelectedNoteId((current) =>
      current && sortedNotes.some((note) => note.id === current) ? current : null
    );
  }, [notes]);

  useEffect(() => {
    if (
      !initialMeetingNoteId ||
      appliedInitialMeetingNoteIdRef.current === initialMeetingNoteId
    ) {
      return;
    }

    const initialNote = localNotes.find(
      (note) => note.id === initialMeetingNoteId
    );
    if (!initialNote) {
      return;
    }

    appliedInitialMeetingNoteIdRef.current = initialMeetingNoteId;
    setIsExpanded(true);
    setListView(initialNote.status === "done" ? "archived" : "active");
    setSelectedNoteId(initialNote.id);
    setNotesDraft(buildNotesDraftFromNote(initialNote));
    setDraftError(null);
  }, [initialMeetingNoteId, localNotes, setIsExpanded]);

  useEffect(() => {
    if (!selectedNoteId || !initialMeetingTodoId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`meeting-todo-${initialMeetingTodoId}`)
        ?.scrollIntoView({ block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialMeetingTodoId, selectedNoteId]);

  useEffect(() => {
    const handleProjectActivity = (event: Event) => {
      const detail = (event as CustomEvent<ProjectActivityRemoteEventDetail>).detail;
      if (
        detail?.activity?.projectId === projectId &&
        detail.activity.domain === "meeting-note"
      ) {
        detail.markHandled();
        window.location.reload();
      }
    };

    window.addEventListener(PROJECT_ACTIVITY_REMOTE_EVENT, handleProjectActivity);
    return () => {
      window.removeEventListener(PROJECT_ACTIVITY_REMOTE_EVENT, handleProjectActivity);
    };
  }, [projectId]);

  const activeNotes = useMemo(
    () => localNotes.filter((note) => note.status !== "done"),
    [localNotes]
  );
  const archivedNotes = useMemo(
    () => localNotes.filter((note) => note.status === "done"),
    [localNotes]
  );
  const meetingTodos = useMemo(
    () => buildProjectMeetingTodos(localNotes, referenceNowMs),
    [localNotes, referenceNowMs]
  );
  const overdueTodoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    meetingTodos.open.forEach((todo) => {
      if (!todo.isOverdue) {
        return;
      }

      counts.set(todo.note.id, (counts.get(todo.note.id) ?? 0) + 1);
    });
    return counts;
  }, [meetingTodos.open]);
  const overdueTodoTotal = useMemo(
    () =>
      Array.from(overdueTodoCounts.values()).reduce(
        (total, count) => total + count,
        0
      ),
    [overdueTodoCounts]
  );
  const overdueMeetingCount = useMemo(
    () => Array.from(overdueTodoCounts.values()).filter((count) => count > 0).length,
    [overdueTodoCounts]
  );
  const visibleSourceNotes = listView === "active" ? activeNotes : archivedNotes;
  const stewardCounts = useMemo(() => {
    const matchesMine = (note: ProjectMeetingNotePanelNote) => {
      const steward = note.steward;
      return (
        steward?.kind === "human" &&
        steward.status === "active" &&
        steward.id === currentActorUserId
      );
    };
    return {
      all: visibleSourceNotes.length,
      mine: visibleSourceNotes.filter(matchesMine).length,
      unassigned: visibleSourceNotes.filter((note) => note.steward == null).length,
    };
  }, [visibleSourceNotes, currentActorUserId]);
  const noteMatchesStewardFilter = useCallback(
    (note: ProjectMeetingNotePanelNote): boolean => {
      if (activeStewardFilter === "all") {
        return true;
      }
      if (activeStewardFilter === "unassigned") {
        return note.steward == null;
      }
      // mine
      const steward = note.steward;
      return (
        steward?.kind === "human" &&
        steward.status === "active" &&
        steward.id === currentActorUserId
      );
    },
    [activeStewardFilter, currentActorUserId]
  );
  const filteredNotes = useMemo(
    () =>
      visibleSourceNotes
        .filter((note) => noteMatchesQuery(note, query))
        .filter((note) => noteMatchesLabelFilters(note, selectedLabelFilters))
        .filter(noteMatchesStewardFilter),
    [
      visibleSourceNotes,
      query,
      selectedLabelFilters,
      noteMatchesStewardFilter,
    ]
  );

  const selectedNote = useMemo(
    () => localNotes.find((note) => note.id === selectedNoteId) ?? null,
    [localNotes, selectedNoteId]
  );
  const prepareNote = useMemo(
    () =>
      prepareDialog?.noteId
        ? localNotes.find((note) => note.id === prepareDialog.noteId) ?? null
        : null,
    [localNotes, prepareDialog]
  );
  const pendingDeleteNote = useMemo(
    () => localNotes.find((note) => note.id === pendingDeleteNoteId) ?? null,
    [localNotes, pendingDeleteNoteId]
  );
  const existingLabels = useMemo(() => {
    const labels = new Set<string>();
    localNotes.forEach((note) => note.labels.forEach((label) => labels.add(label)));
    return Array.from(labels).sort((left, right) => left.localeCompare(right));
  }, [localNotes]);
  const previousExternalParticipants = useMemo(() => {
    const participants = new Map<string, ProjectMeetingParticipantIdentity>();
    for (const note of localNotes) {
      for (const participant of note.participants) {
        if (participant.userId) {
          continue;
        }

        const key = getMeetingParticipantKey(participant);
        if (!participants.has(key)) {
          participants.set(key, participant);
        }
      }
    }

    return Array.from(participants.values()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );
  }, [localNotes]);
  useEffect(() => {
    const availableLabels = new Set(
      existingLabels.map((label) => label.toLocaleLowerCase())
    );
    setSelectedLabelFilters((current) =>
      current.filter((label) => availableLabels.has(label.toLocaleLowerCase()))
    );
  }, [existingLabels]);
  const hasActiveFilters = query.trim() !== "" || selectedLabelFilters.length > 0;
  const labelSuggestions = useMemo(() => {
    const queryValue = prepareDraft.labelInput.trim().toLocaleLowerCase();
    if (!queryValue) {
      return [];
    }

    const selected = new Set(
      prepareDraft.labels.map((label) => label.toLocaleLowerCase())
    );
    return existingLabels
      .filter((label) => label.toLocaleLowerCase().startsWith(queryValue))
      .filter((label) => !selected.has(label.toLocaleLowerCase()))
      .slice(0, 6);
  }, [existingLabels, prepareDraft.labelInput, prepareDraft.labels]);

  const toggleLabelFilter = (label: string) => {
    setSelectedLabelFilters((current) =>
      current.some(
        (selectedLabel) =>
          selectedLabel.toLocaleLowerCase() === label.toLocaleLowerCase()
      )
        ? current.filter(
            (selectedLabel) =>
              selectedLabel.toLocaleLowerCase() !== label.toLocaleLowerCase()
          )
        : [...current, label]
    );
    setSelectedNoteId(null);
  };

  const resetPrepareDraft = () => {
    setPrepareDraft(EMPTY_PREPARE_DRAFT);
    setDraftError(null);
  };

  const openPrepareCreate = () => {
    if (!canEdit) {
      return;
    }

    resetPrepareDraft();
    setPrepareDialog({ mode: "create", noteId: null });
    setIsExpanded(true);
  };

  const openPrepareEdit = (note: ProjectMeetingNotePanelNote) => {
    if (!canEdit) {
      return;
    }

    setPrepareDraft(buildPrepareDraftFromNote(note));
    setDraftError(null);
    setPrepareDialog({ mode: "edit", noteId: note.id });
    setSelectedNoteId(null);
  };

  const closePrepareDialog = () => {
    if (isSaving) {
      return;
    }

    setPrepareDialog(null);
    resetPrepareDraft();
  };

  const openNoteDialog = (note: ProjectMeetingNotePanelNote) => {
    if (selectedNoteId === note.id) {
      setSelectedNoteId(null);
      setNotesDraft(EMPTY_NOTES_DRAFT);
      return;
    }

    setSelectedNoteId(note.id);
    setNotesDraft(buildNotesDraftFromNote(note));
    setDraftError(null);
  };

  const openNoteFromTodoPanel = (note: ProjectMeetingNotePanelNote) => {
    setListView(note.status === "done" ? "archived" : "active");
    setIsExpanded(true);
    setSelectedNoteId(note.id);
    setNotesDraft(buildNotesDraftFromNote(note));
    setDraftError(null);
  };

  const setTodoCompleted = async (
    todo: ProjectMeetingTodo,
    completed: boolean
  ) => {
    if (!canEdit || pendingTodoActionId) {
      return;
    }

    setPendingTodoActionId(todo.action.id);
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${todo.note.id}/actions/${todo.action.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ completed }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; note?: ProjectMeetingNotePanelNote }
        | null;

      if (!response.ok || !payload?.note) {
        throw new Error(mapMeetingNoteError(payload?.error ?? "unknown"));
      }

      setLocalNotes((current) =>
        sortNotes(
          current.map((note) => (note.id === payload.note?.id ? payload.note : note))
        )
      );
      if (selectedNoteId === payload.note.id) {
        setNotesDraft(buildNotesDraftFromNote(payload.note));
      }
      pushToast({
        variant: "success",
        message: completed ? "Meeting todo completed." : "Meeting todo reopened.",
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Could not update meeting todo.",
      });
    } finally {
      setPendingTodoActionId(null);
    }
  };

  const setNoteSteward = async (
    note: ProjectMeetingNotePanelNote,
    steward: MeetingTodoActorReference | null
  ) => {
    if (!canEdit || pendingStewardNoteId) {
      return;
    }

    setPendingStewardNoteId(note.id);
    setStewardError(null);
    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${note.id}/steward`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steward }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; note?: ProjectMeetingNotePanelNote }
        | null;
      if (!response.ok || !payload?.note) {
        throw new Error(mapMeetingNoteError(payload?.error ?? "unknown"));
      }

      setLocalNotes((current) =>
        sortNotes(
          current.map((entry) =>
            entry.id === payload.note?.id ? payload.note : entry
          )
        )
      );
      const stewardName = steward
        ? todoActors.find(
            (actor) =>
              actor.kind === steward.kind && actor.id === steward.id
          )?.displayName ?? "steward"
        : null;
      pushToast({
        variant: "success",
        message: stewardName
          ? `${stewardName} is now stewarding this note.`
          : "Steward cleared from this note.",
      });
      router.refresh();
    } catch (error) {
      setStewardError(
        error instanceof Error
          ? error.message
          : "Could not update the steward. The actor may no longer have project access."
      );
    } finally {
      setPendingStewardNoteId(null);
    }
  };

  const closeNoteDialog = () => {
    if (isSaving) {
      return;
    }

    setSelectedNoteId(null);
    setNotesDraft(EMPTY_NOTES_DRAFT);
    setDraftError(null);
  };

  const savePrepareDialog = async () => {
    if (!prepareDialog || isSaving) {
      return;
    }

    const payload = {
      ...(prepareNote ? buildBasePayload(prepareNote) : {}),
      title: prepareDraft.title.trim(),
      scheduledAt: fromDateTimeLocal(prepareDraft.scheduledAtLocal),
      participants: buildParticipantPayload(prepareDraft.participants),
      labels: prepareDraft.labels,
      status: prepareNote?.status ?? "prepared",
      inputNotes: prepareDraft.inputNotes.trim(),
      outputNotes: prepareNote?.outputNotes ?? "",
      decisions: prepareNote?.decisions ?? "",
      actions: prepareNote?.actions ?? [],
    };

    if (!payload.title) {
      setDraftError("Meeting title is required.");
      return;
    }

    setIsSaving(true);
    setDraftError(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        prepareDialog.mode === "create"
          ? `/api/projects/${projectId}/meeting-notes`
          : `/api/projects/${projectId}/meeting-notes/${prepareDialog.noteId}`,
        {
          method: prepareDialog.mode === "create" ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responsePayload = (await response.json().catch(() => null)) as
        | { error?: string; note?: ProjectMeetingNotePanelNote }
        | null;

      if (!response.ok || !responsePayload?.note) {
        throw new Error(mapMeetingNoteError(responsePayload?.error ?? "unknown"));
      }

      const savedNote = responsePayload.note;
      setLocalNotes((current) =>
        sortNotes(
          prepareDialog.mode === "create"
            ? [savedNote, ...current]
            : current.map((note) => (note.id === savedNote.id ? savedNote : note))
        )
      );
      setPrepareDialog(null);
      resetPrepareDraft();
      setSelectedNoteId(null);
      pushToast({
        variant: "success",
        message:
          prepareDialog.mode === "create"
            ? "Meeting prepared."
            : "Meeting preparation saved.",
      });
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Could not save meeting note."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateDraftAction = (actionId: string, content: string) => {
    setNotesDraft((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === actionId ? { ...action, content } : action
      ),
    }));
  };

  const addDraftAction = () => {
    setNotesDraft((current) => ({
      ...current,
      actions: [
        ...current.actions,
        {
          id: createLocalId("meeting-action"),
          content: "",
          completedAt: null,
          persisted: false,
          creator: null,
          assignee: null,
          completedBy: null,
        },
      ],
    }));
  };

  const removeDraftAction = (actionId: string) => {
    setNotesDraft((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId),
    }));
  };

  const updateDraftActionAssignee = (
    actionId: string,
    assignee: MeetingTodoActorReference | null
  ) => {
    const selectedActor = assignee
      ? todoActors.find(
          (actor) => getMeetingTodoActorKey(actor) === getMeetingTodoActorKey(assignee)
        ) ?? null
      : null;
    setNotesDraft((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === actionId ? { ...action, assignee: selectedActor } : action
      ),
    }));
  };

  const toggleDraftAction = (actionId: string) => {
    setNotesDraft((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === actionId
          ? {
              ...action,
              completedAt: action.completedAt ? null : new Date().toISOString(),
            }
          : action
      ),
    }));
  };

  const saveNotesDialog = async () => {
    if (!selectedNote || isSaving) {
      return;
    }

    const payload = {
      ...buildBasePayload(selectedNote),
      outputNotes: notesDraft.outputNotes.trim(),
      status: notesDraft.status,
      actions: notesDraft.actions
        .map((action) => ({
          id: action.persisted ? action.id : null,
          content: action.content.trim(),
          completedAt: action.completedAt,
          ...(action.assignee?.isAssignable === false
            ? {}
            : {
                assignee: action.assignee
                  ? { kind: action.assignee.kind, id: action.assignee.id }
                  : null,
              }),
        }))
        .filter((action) => action.content.length > 0),
    };

    setIsSaving(true);
    setDraftError(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${selectedNote.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responsePayload = (await response.json().catch(() => null)) as
        | { error?: string; note?: ProjectMeetingNotePanelNote }
        | null;

      if (!response.ok || !responsePayload?.note) {
        throw new Error(mapMeetingNoteError(responsePayload?.error ?? "unknown"));
      }

      const savedNote = responsePayload.note;
      setLocalNotes((current) =>
        sortNotes(current.map((note) => (note.id === savedNote.id ? savedNote : note)))
      );
      setSelectedNoteId(null);
      setNotesDraft(EMPTY_NOTES_DRAFT);
      setDraftError(null);
      if (savedNote.status === "done") {
        setListView("archived");
      }
      pushToast({
        variant: "success",
        message: savedNote.status === "done" ? "Meeting note archived." : "Meeting note saved.",
      });
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Could not save meeting notes."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteNote || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/meeting-notes/${pendingDeleteNote.id}`,
        {
          method: "DELETE",
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(mapMeetingNoteError(payload?.error ?? "unknown"));
      }

      const remainingNotes = localNotes.filter(
        (note) => note.id !== pendingDeleteNote.id
      );
      setLocalNotes(remainingNotes);
      setSelectedNoteId((current) =>
        current === pendingDeleteNote.id ? null : current
      );
      setPendingDeleteNoteId(null);
      pushToast({
        variant: "success",
        message: "Meeting note deleted.",
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Could not delete meeting note.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isLocked =
    Boolean(prepareDialog) ||
    Boolean(selectedNoteId) ||
    isSaving ||
    Boolean(pendingTodoActionId) ||
    Boolean(pendingDeleteNoteId) ||
    isDeleting;

  return (
    <Card
      className={PROJECT_SECTION_CARD_CLASS}
      data-project-live-refresh-lock={isLocked ? "true" : undefined}
    >
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
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
                <ClipboardList className="h-4 w-4" />
                Meeting notes
              </CardTitle>
            </div>
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
              {activeNotes.length} active
            </span>
            {overdueTodoTotal > 0 ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-200">
                {overdueTodoTotal} overdue
              </span>
            ) : null}
          </button>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                onClick={openPrepareCreate}
              >
                <PlusSquare className="h-4 w-4" />
                Prepare meeting
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-4", PROJECT_SECTION_CONTENT_CLASS)}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="Search titles, participants, labels, inputs, outputs, actions"
                aria-label="Search meeting notes"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Clear meeting notes search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 rounded-md border border-border/70 bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => {
                  setListView("active");
                  setSelectedNoteId(null);
                }}
                className={cn(
                  "rounded px-3 py-2 text-sm font-medium transition",
                  listView === "active"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Active ({activeNotes.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setListView("archived");
                  setSelectedNoteId(null);
                }}
                className={cn(
                  "rounded px-3 py-2 text-sm font-medium transition",
                  listView === "archived"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Archived ({archivedNotes.length})
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/15 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Steward
            </div>
            <nav
              aria-label="Steward filter"
              className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-muted/40 p-1 sm:grid-cols-3"
            >
              {(
                [
                  ["all", "All", stewardCounts.all],
                  ["mine", "Stewarded by me", stewardCounts.mine],
                  ["unassigned", "Unstewarded", stewardCounts.unassigned],
                ] as const
              ).map(([value, label, count]) => {
                const isCurrent = activeStewardFilter === value;
                return (
                  <Link
                    key={value}
                    href={buildNotesHref({
                      projectId,
                      stewardFilter: value,
                      query: query.trim() || null,
                    })}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCurrent
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{label}</span>
                    <span className="tabular-nums text-xs">{count}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {existingLabels.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  Filter by label
                </div>
                {selectedLabelFilters.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedLabelFilters([])}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Clear labels
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {existingLabels.map((label) => {
                  const isSelected = selectedLabelFilters.some(
                    (selectedLabel) =>
                      selectedLabel.toLocaleLowerCase() === label.toLocaleLowerCase()
                  );

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleLabelFilter(label)}
                      aria-pressed={isSelected}
                      aria-label={`Filter meeting notes by label ${label}`}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                        isSelected
                          ? "border-slate-950/20 text-slate-950 shadow-sm ring-2 ring-ring/20 dark:border-white/20"
                          : "border-border/70 text-slate-950 opacity-80 hover:opacity-100"
                      )}
                      style={{ backgroundColor: getTaskLabelColor(label) }}
                    >
                      {isSelected ? <Check className="h-3 w-3 shrink-0" /> : null}
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {overdueTodoTotal > 0 ? (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {overdueTodoTotal} overdue todo
                    {overdueTodoTotal === 1 ? "" : "s"} across {overdueMeetingCount} meeting
                    {overdueMeetingCount === 1 ? "" : "s"}.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800/80 dark:text-amber-100/80">
                    Open todos are marked overdue seven days after the meeting date.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters
                  ? "No matching meeting notes."
                  : listView === "archived"
                    ? "No archived meeting notes."
                    : "No active meeting notes yet."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Try another search or clear the selected labels."
                  : listView === "archived"
                    ? "Done meeting notes will land here."
                    : "Prepare one before the next discussion."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredNotes.map((note) => {
                const counts = actionCounts(note);
                const isSelected = selectedNoteId === note.id;
                const overdueCount = overdueTodoCounts.get(note.id) ?? 0;
                const isOverdue = overdueCount > 0;

                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNoteDialog(note)}
                    className={cn(
                      "flex min-h-[168px] w-full flex-col rounded-2xl border p-4 text-left transition hover:border-primary/30 hover:bg-muted/30",
                      isOverdue
                        ? "border-amber-500/40 bg-amber-500/10 shadow-[0_18px_50px_-36px_rgba(245,158,11,0.9)]"
                        : isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/70 bg-background/70"
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="line-clamp-2 text-sm font-semibold text-foreground">
                          {note.title}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatShortDate(note.scheduledAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[11px]", STATUS_BADGE_CLASS[note.status])}
                      >
                        {STATUS_LABELS[note.status]}
                      </Badge>
                    </div>

                    {isOverdue ? (
                      <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-background/70 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {overdueCount} overdue todo
                        {overdueCount === 1 ? "" : "s"}
                      </div>
                    ) : null}

                    {note.labels.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {note.labels.slice(0, 3).map((label) => (
                          <LabelPill key={label} label={label} />
                        ))}
                        {note.labels.length > 3 ? (
                          <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                            +{note.labels.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {note.inputNotes || "No preparation inputs captured."}
                    </p>

                    <div className="mt-3">
                      <MeetingTodoActorIdentity
                        actor={note.steward ?? null}
                        prefix="Steward"
                      />
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {note.participants.length}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListTodo className="h-3.5 w-3.5" />
                        {counts.completed}/{counts.total}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      ) : null}

      <MeetingTodoQuickDialog
        notes={localNotes}
        canEdit={canEdit}
        referenceNowMs={referenceNowMs}
        pendingActionId={pendingTodoActionId}
        onOpenMeeting={openNoteFromTodoPanel}
        onSetCompleted={(todo, completed) => {
          void setTodoCompleted(todo, completed);
        }}
      />

      {prepareDialog ? (
        <MeetingDialogShell
          title={prepareDialog.mode === "create" ? "Prepare meeting" : "Edit preparation"}
          subtitle="Set the meeting frame first. Outputs and todos are captured after opening the note."
          onClose={closePrepareDialog}
          dismissible={!isSaving}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={closePrepareDialog}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void savePrepareDialog()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save preparation"}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="meeting-title" className="text-sm font-medium">
                Title
              </label>
              <EmojiInputField
                id="meeting-title"
                autoFocus
                value={prepareDraft.title}
                onChange={(event) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Weekly execution review"
                maxLength={140}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="meeting-scheduled-at" className="text-sm font-medium">
                  Meeting time
                </label>
                {prepareDraft.scheduledAtLocal ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs"
                    onClick={() =>
                      setPrepareDraft((current) => ({
                        ...current,
                        scheduledAtLocal: "",
                      }))
                    }
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              <CalendarDateTimeField
                id="meeting-scheduled-at"
                value={prepareDraft.scheduledAtLocal}
                onChange={(value) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    scheduledAtLocal: value,
                  }))
                }
                includeTime
                disabled={isSaving}
              />
            </div>

            {prepareNote ? (
              <div className="grid gap-2 rounded-2xl border border-border/60 bg-muted/15 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Steward / facilitator</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <MeetingTodoAssigneeChip
                    id={`meeting-note-steward-prepare-${prepareNote.id}`}
                    value={prepareNote.steward ?? null}
                    options={todoActors}
                    onChange={(steward) => {
                      void setNoteSteward(prepareNote, steward);
                    }}
                    disabled={pendingStewardNoteId === prepareNote.id}
                    pending={pendingStewardNoteId === prepareNote.id}
                  />
                  {pendingStewardNoteId === prepareNote.id ? (
                    <span className="text-xs text-muted-foreground">
                      Updating steward…
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  New notes default to you as steward. Reassign any time without
                  changing the note content.
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <MeetingTodoActorIdentity
                    actor={prepareNote.createdBy ?? null}
                    prefix="Created by"
                  />
                  <MeetingTodoActorIdentity
                    actor={prepareNote.updatedBy ?? null}
                    prefix="Last edited by"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <label htmlFor="meeting-participants" className="text-sm font-medium">
                Participants
              </label>
              <MeetingParticipantPicker
                id="meeting-participants"
                value={prepareDraft.participants}
                inputValue={prepareDraft.participantInput}
                collaborators={collaborators}
                previousExternalParticipants={previousExternalParticipants}
                onInputValueChange={(value) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    participantInput: value,
                  }))
                }
                onChange={(participants) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    participants,
                  }))
                }
                maxItems={40}
                disabled={isSaving}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="meeting-labels" className="text-sm font-medium">
                Labels
              </label>
              <TokenInput
                id="meeting-labels"
                value={prepareDraft.labels}
                inputValue={prepareDraft.labelInput}
                onInputValueChange={(value) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    labelInput: value,
                  }))
                }
                onChange={(labels) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    labels,
                  }))
                }
                normalizeToken={normalizeTaskLabel}
                delimiters={["Enter", ","]}
                maxItems={MAX_TASK_LABELS}
                maxInputLength={60}
                placeholder="Type label and press Enter"
                tokenClassName="border-transparent text-slate-950"
                getTokenStyle={(label) => ({ backgroundColor: getTaskLabelColor(label) })}
                disabled={isSaving}
              />
              {labelSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {labelSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setPrepareDraft((current) => ({
                          ...current,
                          labels: current.labels.some(
                            (label) =>
                              label.toLocaleLowerCase() ===
                              suggestion.toLocaleLowerCase()
                          )
                            ? current.labels
                            : [...current.labels, suggestion],
                          labelInput: "",
                        }))
                      }
                      className="rounded-full border border-border/70 bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor="meeting-inputs" className="text-sm font-medium">
                Inputs
              </label>
              <EmojiTextareaField
                id="meeting-inputs"
                value={prepareDraft.inputNotes}
                onChange={(event) =>
                  setPrepareDraft((current) => ({
                    ...current,
                    inputNotes: event.target.value,
                  }))
                }
                className="min-h-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Agenda, questions, links, context to bring in."
              />
            </div>

            {draftError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {draftError}
              </div>
            ) : null}
          </div>
        </MeetingDialogShell>
      ) : null}

      {selectedNote ? (
        <MeetingDialogShell
          title={selectedNote.title}
          subtitle={formatMeetingTime(selectedNote.scheduledAt)}
          onClose={closeNoteDialog}
          dismissible={!isSaving}
          maxWidthClassName="max-w-4xl"
          footer={
            canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openPrepareEdit(selectedNote)}
                    disabled={isSaving}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit prep
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPendingDeleteNoteId(selectedNote.id)}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
                <Button
                  type="button"
                  onClick={() => void saveNotesDialog()}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save notes"}
                </Button>
              </div>
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn("text-xs", STATUS_BADGE_CLASS[notesDraft.status])}
              >
                {STATUS_LABELS[notesDraft.status]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Users className="h-3.5 w-3.5" />
                {selectedNote.participants.length} participant
                {selectedNote.participants.length === 1 ? "" : "s"}
              </Badge>
              {selectedNote.status === "done" ? (
                <Badge variant="outline" className="text-xs">
                  <Archive className="h-3.5 w-3.5" />
                  Archived
                </Badge>
              ) : null}
              {(overdueTodoCounts.get(selectedNote.id) ?? 0) > 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-200"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {overdueTodoCounts.get(selectedNote.id)} overdue
                </Badge>
              ) : null}
            </div>

            {selectedNote.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedNote.labels.map((label) => (
                  <LabelPill key={label} label={label} />
                ))}
              </div>
            ) : null}

            {selectedNote.participants.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedNote.participants.map((participant) => (
                  <span
                    key={getMeetingParticipantKey(participant)}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/40 p-1 pr-3 text-xs font-semibold text-foreground"
                  >
                    <MeetingParticipantAvatar
                      participant={participant}
                      className="h-7 w-7 text-[10px]"
                      decorative
                    />
                    <span className="truncate">{participant.displayName}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2 rounded-2xl border border-border/60 bg-muted/15 p-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span>Steward / facilitator</span>
                {!canEdit ? (
                  <span className="text-[10px] font-normal normal-case text-muted-foreground">
                    View only
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {canEdit ? (
                  <MeetingTodoAssigneeChip
                    id={`meeting-note-steward-${selectedNote.id}`}
                    value={selectedNote.steward ?? null}
                    options={todoActors}
                    onChange={(steward) => {
                      void setNoteSteward(selectedNote, steward);
                    }}
                    disabled={pendingStewardNoteId === selectedNote.id}
                    pending={pendingStewardNoteId === selectedNote.id}
                  />
                ) : (
                  <MeetingTodoAssigneeChipReadonly
                    actor={selectedNote.steward ?? null}
                  />
                )}
                {pendingStewardNoteId === selectedNote.id ? (
                  <span className="text-xs text-muted-foreground">
                    Updating steward…
                  </span>
                ) : null}
              </div>
              {stewardError ? (
                <p
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {stewardError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <MeetingTodoActorIdentity
                  actor={selectedNote.createdBy ?? null}
                  prefix="Created by"
                />
                <MeetingTodoActorIdentity
                  actor={selectedNote.updatedBy ?? null}
                  prefix="Last edited by"
                />
                <span>
                  Updated{" "}
                  <time dateTime={selectedNote.updatedAt}>
                    {formatMeetingTimestamp(selectedNote.updatedAt)}
                  </time>
                </span>
              </div>
            </div>

            <SectionBlock title="Inputs">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {selectedNote.inputNotes || "No inputs captured."}
              </p>
            </SectionBlock>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
              <div className="grid gap-2">
                <label htmlFor="meeting-outputs" className="text-sm font-medium">
                  Outputs
                </label>
                <EmojiTextareaField
                  id="meeting-outputs"
                  value={notesDraft.outputNotes}
                  onChange={(event) =>
                    setNotesDraft((current) => ({
                      ...current,
                      outputNotes: event.target.value,
                    }))
                  }
                  className="min-h-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="What changed, what was clarified, what needs to happen next."
                  disabled={!canEdit || isSaving}
                />
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label htmlFor="meeting-status" className="text-sm font-medium">
                    State
                  </label>
                  <MeetingStatusSelect
                    id="meeting-status"
                    value={notesDraft.status}
                    onChange={(status) =>
                      setNotesDraft((current) => ({
                        ...current,
                        status,
                      }))
                    }
                    disabled={!canEdit || isSaving}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium">Meeting todos</label>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addDraftAction}
                        disabled={isSaving}
                      >
                        <PlusSquare className="h-4 w-4" />
                        Add
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {notesDraft.actions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                        No todos yet.
                      </div>
                    ) : (
                      notesDraft.actions.map((action, index) => {
                        const isComplete = action.completedAt != null;
                        return (
                          <div
                            key={action.id}
                            id={`meeting-todo-${action.id}`}
                            className={cn(
                              "space-y-2 rounded-xl bg-card/60 p-3",
                              action.id === initialMeetingTodoId &&
                                "bg-primary/10 ring-2 ring-primary/35"
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={
                                  !canEdit ||
                                  isSaving ||
                                  pendingTodoActionId === action.id
                                }
                                onClick={() => {
                                  const persistedAction = selectedNote.actions.find(
                                    (entry) => entry.id === action.id
                                  );
                                  if (action.persisted && persistedAction) {
                                    void setTodoCompleted(
                                      {
                                        action: persistedAction,
                                        note: selectedNote,
                                        isOverdue: false,
                                        urgencyTimestamp: 0,
                                      },
                                      !isComplete
                                    );
                                  } else {
                                    toggleDraftAction(action.id);
                                  }
                                }}
                                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
                                aria-label={`${isComplete ? "Reopen" : "Complete"} todo ${index + 1}`}
                              >
                                {isComplete ? (
                                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                ) : (
                                  <Circle className="h-5 w-5" />
                                )}
                              </button>
                              <EmojiInputField
                                wrapperClassName="min-w-0 flex-1"
                                value={action.content}
                                onChange={(event) =>
                                  updateDraftAction(action.id, event.target.value)
                                }
                                className={cn(
                                  "h-11 rounded-md border border-input bg-background px-3 text-sm",
                                  isComplete ? "text-muted-foreground line-through" : ""
                                )}
                                placeholder="Send recap to stakeholders"
                                maxLength={240}
                                aria-label={`Todo ${index + 1}`}
                                disabled={!canEdit || isSaving}
                              />
                              {canEdit ? (
                                <MeetingTodoAssigneeChip
                                  id={`meeting-todo-assignee-${action.id}`}
                                  value={action.assignee ?? null}
                                  options={todoActors}
                                  onChange={(assignee) =>
                                    updateDraftActionAssignee(action.id, assignee)
                                  }
                                  disabled={isSaving}
                                  pending={isSaving}
                                  bordered={false}
                                />
                              ) : (
                                <MeetingTodoAssigneeChipReadonly
                                  actor={action.assignee ?? null}
                                  bordered={false}
                                />
                              )}
                              {canEdit ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeDraftAction(action.id)}
                                  aria-label={`Remove todo ${index + 1}`}
                                  disabled={isSaving}
                                  className="h-11 w-11 shrink-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-2">
                              {action.creator ? (
                                <MeetingTodoActorIdentity
                                  actor={action.creator}
                                  prefix="Created by"
                                  compact
                                />
                              ) : null}
                              {isComplete && action.completedBy ? (
                                <MeetingTodoActorIdentity
                                  actor={action.completedBy}
                                  prefix="Completed by"
                                  compact
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {draftError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {draftError}
              </div>
            ) : null}
          </div>
        </MeetingDialogShell>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteNote)}
        title="Delete meeting note?"
        description={
          pendingDeleteNote
            ? `Delete "${pendingDeleteNote.title}" and its todos?`
            : ""
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete note"}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!isDeleting) {
            setPendingDeleteNoteId(null);
          }
        }}
        isConfirming={isDeleting}
      />
    </Card>
  );
}
