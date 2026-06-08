"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Circle,
  Pencil,
  PlusSquare,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

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
  fetchProjectActivityMutation,
  PROJECT_ACTIVITY_REMOTE_EVENT,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

export interface ProjectMeetingNotePanelAction {
  id: string;
  content: string;
  completedAt: string | null;
  position: number;
}

export interface ProjectMeetingNotePanelNote {
  id: string;
  projectId: string;
  title: string;
  scheduledAt: string | null;
  participants: string[];
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  actions: ProjectMeetingNotePanelAction[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectMeetingNotesPanelProps {
  projectId: string;
  canEdit: boolean;
  notes: ProjectMeetingNotePanelNote[];
}

interface DraftAction {
  id: string;
  content: string;
  completedAt: string | null;
}

type EditorMode = "create" | "edit";

interface MeetingNoteDraft {
  title: string;
  scheduledAtLocal: string;
  participantsText: string;
  inputNotes: string;
  outputNotes: string;
  decisions: string;
  actions: DraftAction[];
}

const EMPTY_DRAFT: MeetingNoteDraft = {
  title: "",
  scheduledAtLocal: "",
  participantsText: "",
  inputNotes: "",
  outputNotes: "",
  decisions: "",
  actions: [],
};

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

function splitParticipants(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((participant) => participant.trim())
    .filter(Boolean);
}

function buildDraftFromNote(note: ProjectMeetingNotePanelNote): MeetingNoteDraft {
  return {
    title: note.title,
    scheduledAtLocal: toDateTimeLocal(note.scheduledAt),
    participantsText: note.participants.join("\n"),
    inputNotes: note.inputNotes,
    outputNotes: note.outputNotes,
    decisions: note.decisions,
    actions: note.actions.map((action) => ({
      id: action.id,
      content: action.content,
      completedAt: action.completedAt,
    })),
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
    case "meeting-note-section-too-long":
      return "Meeting sections are too long.";
    case "meeting-note-too-many-actions":
      return "Keep follow-up actions to 40 items or fewer.";
    case "meeting-note-action-too-long":
      return "Follow-up actions must be 240 characters or fewer.";
    case "meeting-note-not-found":
      return "Meeting note not found.";
    case "forbidden":
      return "You do not have permission to change meeting notes.";
    default:
      return "Could not save meeting notes. Please retry.";
  }
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
    ...note.participants,
    note.inputNotes,
    note.outputNotes,
    note.decisions,
    ...note.actions.map((action) => action.content),
  ]
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(normalizedQuery);
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

export function ProjectMeetingNotesPanel({
  projectId,
  canEdit,
  notes,
}: ProjectMeetingNotesPanelProps) {
  const { pushToast } = useToast();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "meeting-notes",
    defaultExpanded: true,
    logLabel: "ProjectMeetingNotesPanel",
  });
  const [localNotes, setLocalNotes] = useState<ProjectMeetingNotePanelNote[]>(() =>
    sortNotes(notes)
  );
  const [query, setQuery] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    notes[0]?.id ?? null
  );
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<MeetingNoteDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const sortedNotes = sortNotes(notes);
    setLocalNotes(sortedNotes);
    setSelectedNoteId((current) => {
      if (current && sortedNotes.some((note) => note.id === current)) {
        return current;
      }

      return sortedNotes[0]?.id ?? null;
    });
  }, [notes]);

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

  const filteredNotes = useMemo(
    () => localNotes.filter((note) => noteMatchesQuery(note, query)),
    [localNotes, query]
  );

  const selectedNote = useMemo(
    () => localNotes.find((note) => note.id === selectedNoteId) ?? null,
    [localNotes, selectedNoteId]
  );

  const pendingDeleteNote = useMemo(
    () => localNotes.find((note) => note.id === pendingDeleteNoteId) ?? null,
    [localNotes, pendingDeleteNoteId]
  );

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
  };

  const startCreate = () => {
    if (!canEdit) {
      return;
    }

    resetDraft();
    setEditorMode("create");
    setIsExpanded(true);
  };

  const startEdit = (note: ProjectMeetingNotePanelNote) => {
    if (!canEdit) {
      return;
    }

    setSelectedNoteId(note.id);
    setDraft(buildDraftFromNote(note));
    setDraftError(null);
    setEditorMode("edit");
    setIsExpanded(true);
  };

  const closeEditor = () => {
    if (isSaving) {
      return;
    }

    setEditorMode(null);
    resetDraft();
  };

  const updateDraftAction = (actionId: string, content: string) => {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === actionId ? { ...action, content } : action
      ),
    }));
  };

  const addDraftAction = () => {
    setDraft((current) => ({
      ...current,
      actions: [
        ...current.actions,
        {
          id: createLocalId("meeting-action"),
          content: "",
          completedAt: null,
        },
      ],
    }));
  };

  const removeDraftAction = (actionId: string) => {
    setDraft((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId),
    }));
  };

  const buildPayload = (sourceDraft: MeetingNoteDraft) => ({
    title: sourceDraft.title.trim(),
    scheduledAt: fromDateTimeLocal(sourceDraft.scheduledAtLocal),
    participants: splitParticipants(sourceDraft.participantsText),
    inputNotes: sourceDraft.inputNotes.trim(),
    outputNotes: sourceDraft.outputNotes.trim(),
    decisions: sourceDraft.decisions.trim(),
    actions: sourceDraft.actions
      .map((action) => ({
        id: action.id,
        content: action.content.trim(),
        completedAt: action.completedAt,
      }))
      .filter((action) => action.content.length > 0),
  });

  const handleSave = async () => {
    if (!editorMode || isSaving) {
      return;
    }

    const payload = buildPayload(draft);
    if (!payload.title) {
      setDraftError("Meeting title is required.");
      return;
    }

    const editingNote = editorMode === "edit" ? selectedNote : null;
    if (editorMode === "edit" && !editingNote) {
      setDraftError("Meeting note not found.");
      return;
    }

    setIsSaving(true);
    setDraftError(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        editorMode === "create"
          ? `/api/projects/${projectId}/meeting-notes`
          : `/api/projects/${projectId}/meeting-notes/${editingNote?.id}`,
        {
          method: editorMode === "create" ? "POST" : "PATCH",
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
          editorMode === "create"
            ? [savedNote, ...current]
            : current.map((note) => (note.id === savedNote.id ? savedNote : note))
        )
      );
      setSelectedNoteId(savedNote.id);
      setEditorMode(null);
      resetDraft();
      pushToast({
        variant: "success",
        message: editorMode === "create" ? "Meeting note created." : "Meeting note saved.",
      });
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Could not save meeting note."
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
        current === pendingDeleteNote.id ? remainingNotes[0]?.id ?? null : current
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

  const toggleAction = async (actionId: string) => {
    if (!selectedNote || !canEdit) {
      return;
    }

    const nextActions = selectedNote.actions.map((action) =>
      action.id === actionId
        ? {
            ...action,
            completedAt: action.completedAt ? null : new Date().toISOString(),
          }
        : action
    );

    const payload = {
      title: selectedNote.title,
      scheduledAt: selectedNote.scheduledAt,
      participants: selectedNote.participants,
      inputNotes: selectedNote.inputNotes,
      outputNotes: selectedNote.outputNotes,
      decisions: selectedNote.decisions,
      actions: nextActions,
    };

    setLocalNotes((current) =>
      current.map((note) =>
        note.id === selectedNote.id ? { ...note, actions: nextActions } : note
      )
    );

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
        current.map((note) => (note.id === savedNote.id ? savedNote : note))
      );
    } catch (error) {
      setLocalNotes((current) =>
        current.map((note) => (note.id === selectedNote.id ? selectedNote : note))
      );
      pushToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Could not update follow-up.",
      });
    }
  };

  const visibleNote = editorMode ? null : selectedNote;
  const isLocked =
    Boolean(editorMode) ||
    isSaving ||
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
              {localNotes.length} note{localNotes.length === 1 ? "" : "s"}
            </span>
          </button>

          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={startCreate}
            >
              <PlusSquare className="h-4 w-4" />
              New note
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-4", PROJECT_SECTION_CONTENT_CLASS)}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Search titles, participants, inputs, outputs, decisions, actions"
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

          <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.85fr),minmax(0,1.65fr)]">
            <aside className="space-y-2">
              {filteredNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {query ? "No matching meeting notes." : "No meeting notes yet."}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {query
                      ? "Try a participant, decision, output, or follow-up action."
                      : "Create one to prepare the next discussion and keep the output nearby."}
                  </p>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const counts = actionCounts(note);
                  const isSelected = selectedNoteId === note.id && !editorMode;

                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setSelectedNoteId(note.id);
                        setEditorMode(null);
                        resetDraft();
                      }}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition hover:border-primary/30 hover:bg-muted/30",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/70 bg-background/70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {note.title}
                          </p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {formatShortDate(note.scheduledAt)}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[11px]">
                          {counts.completed}/{counts.total}
                        </Badge>
                      </div>
                      {note.participants.length > 0 ? (
                        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                          {note.participants.join(", ")}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
            </aside>

            <section className="min-w-0">
              {editorMode ? (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/75 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold">
                        {editorMode === "create" ? "Prepare meeting" : "Edit meeting note"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Capture the prep before the meeting and the output after it.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={closeEditor}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2 sm:col-span-2">
                      <label htmlFor="meeting-title" className="text-sm font-medium">
                        Title
                      </label>
                      <EmojiInputField
                        id="meeting-title"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({
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
                      <label htmlFor="meeting-scheduled-at" className="text-sm font-medium">
                        Meeting time
                      </label>
                      <input
                        id="meeting-scheduled-at"
                        type="datetime-local"
                        value={draft.scheduledAtLocal}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            scheduledAtLocal: event.target.value,
                          }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label htmlFor="meeting-participants" className="text-sm font-medium">
                        Participants
                      </label>
                      <EmojiTextareaField
                        id="meeting-participants"
                        value={draft.participantsText}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            participantsText: event.target.value,
                          }))
                        }
                        className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Alex, Camille, Priya"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <label htmlFor="meeting-inputs" className="text-sm font-medium">
                        Inputs
                      </label>
                      <EmojiTextareaField
                        id="meeting-inputs"
                        value={draft.inputNotes}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            inputNotes: event.target.value,
                          }))
                        }
                        className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Agenda, questions, links, context to bring in."
                      />
                    </div>

                    <div className="grid gap-2">
                      <label htmlFor="meeting-outputs" className="text-sm font-medium">
                        Outputs
                      </label>
                      <EmojiTextareaField
                        id="meeting-outputs"
                        value={draft.outputNotes}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            outputNotes: event.target.value,
                          }))
                        }
                        className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="What changed, what was clarified, what was agreed."
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="meeting-decisions" className="text-sm font-medium">
                      Decisions
                    </label>
                    <EmojiTextareaField
                      id="meeting-decisions"
                      value={draft.decisions}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          decisions: event.target.value,
                        }))
                      }
                      className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Final decisions and explicit tradeoffs."
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium">Actions for me</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addDraftAction}
                      >
                        <PlusSquare className="h-4 w-4" />
                        Add action
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {draft.actions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                          No follow-up actions yet.
                        </div>
                      ) : (
                        draft.actions.map((action, index) => (
                          <div key={action.id} className="flex items-center gap-2">
                            <span className="w-6 text-center text-xs text-muted-foreground">
                              {index + 1}
                            </span>
                            <EmojiInputField
                              value={action.content}
                              onChange={(event) =>
                                updateDraftAction(action.id, event.target.value)
                              }
                              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                              placeholder="Send recap to stakeholders"
                              maxLength={240}
                              aria-label={`Follow-up action ${index + 1}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDraftAction(action.id)}
                              aria-label={`Remove follow-up action ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {draftError ? (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {draftError}
                    </div>
                  ) : null}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={closeEditor}
                      disabled={isSaving}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={isSaving}
                      className="w-full sm:w-auto"
                    >
                      {isSaving ? "Saving..." : "Save note"}
                    </Button>
                  </div>
                </div>
              ) : visibleNote ? (
                <article className="space-y-4 rounded-2xl border border-border/70 bg-background/75 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatMeetingTime(visibleNote.scheduledAt)}
                        </Badge>
                        <Badge variant="outline">
                          <Users className="h-3.5 w-3.5" />
                          {visibleNote.participants.length} participant
                          {visibleNote.participants.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight">
                        {visibleNote.title}
                      </h3>
                    </div>

                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(visibleNote)}
                          aria-label={`Edit meeting note ${visibleNote.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDeleteNoteId(visibleNote.id)}
                          aria-label={`Delete meeting note ${visibleNote.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {visibleNote.participants.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {visibleNote.participants.map((participant) => (
                        <span
                          key={participant}
                          className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {participant}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <SectionBlock title="Inputs">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {visibleNote.inputNotes || "No inputs captured."}
                      </p>
                    </SectionBlock>
                    <SectionBlock title="Outputs">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {visibleNote.outputNotes || "No outputs captured yet."}
                      </p>
                    </SectionBlock>
                  </div>

                  <SectionBlock title="Decisions">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {visibleNote.decisions || "No decisions captured."}
                    </p>
                  </SectionBlock>

                  <SectionBlock title="Actions for me">
                    {visibleNote.actions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No follow-up actions captured.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {visibleNote.actions.map((action) => {
                          const isComplete = action.completedAt != null;
                          return (
                            <button
                              key={action.id}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => void toggleAction(action.id)}
                              className={cn(
                                "flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left text-sm transition",
                                canEdit ? "hover:bg-muted/40" : "cursor-default",
                                isComplete ? "text-muted-foreground" : "text-foreground"
                              )}
                            >
                              {isComplete ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                              ) : (
                                <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                              )}
                              <span
                                className={cn(
                                  "min-w-0 flex-1",
                                  isComplete ? "line-through decoration-muted-foreground/60" : ""
                                )}
                              >
                                {action.content}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </SectionBlock>
                </article>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Select a meeting note.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Search or choose a previous meeting from the list.
                  </p>
                </div>
              )}
            </section>
          </div>
        </CardContent>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteNote)}
        title="Delete meeting note?"
        description={
          pendingDeleteNote
            ? `Delete "${pendingDeleteNote.title}" and its follow-up actions?`
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
