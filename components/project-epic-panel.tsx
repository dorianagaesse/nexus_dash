"use client";
import { useProjectCapability } from "@/components/project-capability-provider";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Flag,
  Pencil,
  PlusSquare,
  Trash2,
  X,
} from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  EmojiInputField,
  EmojiTextareaField,
} from "@/components/ui/emoji-field";
import { FORM_FOCUS_BORDER_CLASS } from "@/components/ui/focus-border-styles";
import type { ProjectEpicSnapshot } from "@/lib/epic";
import { EpicColorMark } from "@/components/epics/epic-color-mark";
import { EpicDetailsDialog } from "@/components/epics/epic-details-dialog";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import {
  fetchProjectActivityMutation,
  PROJECT_ACTIVITY_REMOTE_EVENT,
  type ProjectActivityRemoteEventDetail,
} from "@/lib/project-activity-client";
import {
  discardLatestProjectEpicSnapshot,
  getLatestProjectEpicSnapshot,
  PROJECT_EPICS_RECONCILED_EVENT,
  reconcileProjectEpics,
  type ProjectEpicsReconciledDetail,
} from "@/lib/project-epic-client";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

export type ProjectEpicPanelEpic = ProjectEpicSnapshot;

interface ProjectEpicPanelProps {
  projectId: string;
  canEdit: boolean;
  epics: ProjectEpicPanelEpic[];
  loadError?: string | null;
}

type EpicListView = "active" | "archived";

function mapEpicMutationError(errorCode: string): string {
  switch (errorCode) {
    case "epic-name-too-short":
      return "Epic name must be at least 2 characters.";
    case "epic-description-too-short":
      return "Epic description must be at least 2 characters.";
    case "epic-name-conflict":
      return "Epic names must stay unique within this project.";
    case "epic-not-found":
      return "Epic not found.";
    case "epic-create-failed":
      return "Could not create epic. Please retry.";
    case "epic-update-failed":
      return "Could not update epic. Please retry.";
    case "epic-delete-failed":
      return "Could not delete epic. Please retry.";
    case "epic-archive-failed":
      return "Could not archive epic. Please retry.";
    case "epic-restore-failed":
      return "Could not restore epic. Please retry.";
    default:
      return "Could not save epic changes. Please retry.";
  }
}

export function ProjectEpicPanel({
  projectId,
  canEdit,
  epics,
  loadError = null,
}: ProjectEpicPanelProps) {
  const router = useRouter();
  const { pushToast } = useToast();
  const { isExpanded, setIsExpanded } = useProjectSectionExpanded({
    projectId,
    sectionKey: "epics",
    defaultExpanded: true,
    logLabel: "ProjectEpicPanel",
  });
  const initialEpicsRef = useRef(epics);
  const canDelete = useProjectCapability("epic:delete");
  const [localEpics, setLocalEpics] = useState<ProjectEpicPanelEpic[]>(
    () => getLatestProjectEpicSnapshot(projectId) ?? epics
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeleteEpicId, setPendingDeleteEpicId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [listView, setListView] = useState<EpicListView>("active");
  const [query, setQuery] = useState("");
  const [isUpdatingArchive, setIsUpdatingArchive] = useState(false);
  const [viewedEpicId, setViewedEpicId] = useState<string | null>(null);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sectionToggleRef = useRef<HTMLButtonElement | null>(null);
  const viewedEpic = localEpics.find((epic) => epic.id === viewedEpicId) ?? null;

  const returnActionFocus = () => {
    const target = actionTriggerRef.current;
    if (target?.isConnected) target.focus();
    else sectionToggleRef.current?.focus();
  };

  useEffect(() => {
    if (epics === initialEpicsRef.current) {
      return;
    }

    initialEpicsRef.current = epics;
    discardLatestProjectEpicSnapshot(projectId);
    setLocalEpics(epics);
  }, [epics, projectId]);

  const editingEpic = useMemo(
    () => localEpics.find((epic) => epic.id === editingEpicId) ?? null,
    [editingEpicId, localEpics]
  );

  const activeEpics = useMemo(
    () => localEpics.filter((epic) => !epic.archivedAt),
    [localEpics]
  );

  const archivedEpics = useMemo(
    () => localEpics.filter((epic) => Boolean(epic.archivedAt)),
    [localEpics]
  );

  const selectedEpics = listView === "active" ? activeEpics : archivedEpics;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEpics = useMemo(() => {
    if (!normalizedQuery) {
      return selectedEpics;
    }

    return selectedEpics.filter(
      ({ name, description }) =>
        name.toLocaleLowerCase().includes(normalizedQuery) ||
        description.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, selectedEpics]);

  let listMessage = "";
  if (normalizedQuery && visibleEpics.length === 0) {
    listMessage = "No matching epics. Try another search.";
  } else if (!normalizedQuery && selectedEpics.length === 0) {
    listMessage =
      listView === "active" ? "No active epics yet." : "No archived epics.";
  }

  const pendingDeleteEpic = useMemo(
    () => localEpics.find((epic) => epic.id === pendingDeleteEpicId) ?? null,
    [localEpics, pendingDeleteEpicId]
  );

  const resetCreateDraft = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateError(null);
  };

  const closeCreate = (force = false) => {
    if (isCreating && !force) {
      return;
    }

    setIsCreateOpen(false);
    resetCreateDraft();
  };

  const startEdit = (epic: ProjectEpicPanelEpic) => {
    setEditingEpicId(epic.id);
    setEditName(epic.name);
    setEditDescription(epic.description);
    setEditError(null);
  };

  const cancelEdit = (force = false) => {
    if (isSavingEdit && !force) {
      return;
    }

    setEditingEpicId(null);
    setEditName("");
    setEditDescription("");
    setEditError(null);
  };

  const refreshProjectData = () => {
    router.refresh();
  };

  useEffect(() => {
    function handleProjectEpicsReconciled(event: Event) {
      const detail = (event as CustomEvent<ProjectEpicsReconciledDetail>).detail;
      if (detail?.projectId !== projectId) {
        return;
      }

      setLocalEpics(detail.epics);
      if (
        editingEpicId &&
        !detail.epics.some((epic) => epic.id === editingEpicId)
      ) {
        setEditingEpicId(null);
        setEditName("");
        setEditDescription("");
        setEditError(null);
      }
      if (
        pendingDeleteEpicId &&
        !detail.epics.some((epic) => epic.id === pendingDeleteEpicId)
      ) {
        setPendingDeleteEpicId(null);
      }
    }

    function handleRemoteProjectActivity(event: Event) {
      const detail = (event as CustomEvent<ProjectActivityRemoteEventDetail>)
        .detail;
      const activity = detail?.activity;
      if (!activity || activity.projectId !== projectId) {
        return;
      }

      if (activity.domain === "epic") {
        if (activity.action === "deleted" && activity.entityId) {
          const deletedId = activity.entityId;
          setLocalEpics((previousEpics) =>
            previousEpics.filter((epic) => epic.id !== deletedId)
          );
          if (editingEpicId === deletedId) {
            setEditingEpicId(null);
            setEditName("");
            setEditDescription("");
            setEditError(null);
          }
          if (pendingDeleteEpicId === deletedId) {
            setPendingDeleteEpicId(null);
          }
        }
        void reconcileProjectEpics(projectId);
        detail.markHandled();
        return;
      }

      if (activity.domain === "task") {
        void reconcileProjectEpics(projectId);
      }
    }

    window.addEventListener(
      PROJECT_EPICS_RECONCILED_EVENT,
      handleProjectEpicsReconciled
    );
    window.addEventListener(
      PROJECT_ACTIVITY_REMOTE_EVENT,
      handleRemoteProjectActivity
    );

    return () => {
      window.removeEventListener(
        PROJECT_EPICS_RECONCILED_EVENT,
        handleProjectEpicsReconciled
      );
      window.removeEventListener(
        PROJECT_ACTIVITY_REMOTE_EVENT,
        handleRemoteProjectActivity
      );
    };
  }, [editingEpicId, pendingDeleteEpicId, projectId]);

  const handleCreateEpic = async () => {
    const normalizedName = createName.trim();
    const normalizedDescription = createDescription.trim();
    if (!normalizedName || !normalizedDescription) {
      setCreateError("Epic name and description are required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/epics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            description: normalizedDescription,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        epic?: ProjectEpicPanelEpic;
      } | null;

      if (!response.ok || !payload?.epic) {
        throw new Error(
          mapEpicMutationError(payload?.error ?? "epic-create-failed")
        );
      }

      const createdEpic = payload.epic;
      setLocalEpics((previousEpics) => [
        createdEpic,
        ...previousEpics.filter((epic) => epic.id !== createdEpic.id),
      ]);
      if (listView === "archived") {
        setListView("active");
        cancelEdit();
      }
      setQuery("");
      closeCreate(true);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Epic created.",
      });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create epic."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEpic = async () => {
    if (!editingEpic) {
      return;
    }

    const normalizedName = editName.trim();
    const normalizedDescription = editDescription.trim();
    if (!normalizedName || !normalizedDescription) {
      setEditError("Epic name and description are required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/epics/${editingEpic.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            description: normalizedDescription,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        epic?: ProjectEpicPanelEpic;
      } | null;

      if (!response.ok || !payload?.epic) {
        throw new Error(
          mapEpicMutationError(payload?.error ?? "epic-update-failed")
        );
      }

      const updatedEpic = payload.epic;
      setLocalEpics((previousEpics) =>
        previousEpics.map((epic) =>
          epic.id === updatedEpic.id ? updatedEpic : epic
        )
      );
      cancelEdit(true);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Epic updated.",
      });
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not update epic."
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEpic = async () => {
    if (!pendingDeleteEpic || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/epics/${pendingDeleteEpic.id}`,
        {
          method: "DELETE",
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          mapEpicMutationError(payload?.error ?? "epic-delete-failed")
        );
      }

      setLocalEpics((previousEpics) =>
        previousEpics.filter((epic) => epic.id !== pendingDeleteEpic.id)
      );
      setPendingDeleteEpicId(null);
      refreshProjectData();
      pushToast({
        variant: "success",
        message: "Epic deleted. Linked tasks were left without an epic.",
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Could not delete epic.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleEpicArchived = async (
    epic: ProjectEpicPanelEpic,
    archived: boolean
  ) => {
    if (isUpdatingArchive) {
      return;
    }

    setIsUpdatingArchive(true);

    try {
      const response = await fetchProjectActivityMutation(
        projectId,
        `/api/projects/${projectId}/epics/${epic.id}/archive`,
        {
          method: archived ? "POST" : "DELETE",
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        epic?: ProjectEpicPanelEpic;
      } | null;

      if (!response.ok || !payload?.epic) {
        throw new Error(
          mapEpicMutationError(
            payload?.error ?? (archived ? "epic-archive-failed" : "epic-restore-failed")
          )
        );
      }

      const updatedEpic = payload.epic;
      setLocalEpics((previousEpics) =>
        previousEpics.map((existingEpic) =>
          existingEpic.id === updatedEpic.id ? updatedEpic : existingEpic
        )
      );
      if (editingEpicId === updatedEpic.id) {
        cancelEdit(true);
      }
      refreshProjectData();
      pushToast({
        variant: "success",
        message: archived ? "Epic archived." : "Epic restored.",
      });
    } catch (error) {
      pushToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : archived
              ? "Could not archive epic."
              : "Could not restore epic.",
      });
    } finally {
      setIsUpdatingArchive(false);
    }
  };

  return (
    <Card
      className={PROJECT_SECTION_CARD_CLASS}
      data-project-live-refresh-lock={
        isCreateOpen ||
        isCreating ||
        Boolean(editingEpic) ||
        isSavingEdit ||
        Boolean(pendingDeleteEpicId) ||
        isDeleting ||
        isUpdatingArchive
          ? "true"
          : undefined
      }
    >
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            ref={sectionToggleRef}
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="h-4 w-4" />
                Epics
              </CardTitle>
            </div>
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
              {activeEpics.length} active
            </span>
          </button>

          {canEdit ? (
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                if (open) {
                  setIsExpanded(true);
                  setIsCreateOpen(true);
                } else {
                  closeCreate();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button type="button" size="sm" className="min-h-11 w-full sm:w-auto">
                  <PlusSquare className="h-4 w-4" />
                  New epic
                </Button>
              </DialogTrigger>

              <DialogContent
                aria-describedby={undefined}
                dismissible={!isCreating}
                className="flex max-h-[100dvh] max-w-lg flex-col gap-4 overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-lg">New epic</DialogTitle>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      aria-label="Close epic creation"
                      disabled={isCreating}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>

                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!isCreating) void handleCreateEpic();
                  }}
                >
                  <div className="grid gap-2">
                    <label htmlFor="create-epic-name" className="text-sm font-medium">
                      Name
                    </label>
                    <EmojiInputField
                      id="create-epic-name"
                      autoFocus
                      required
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      className={cn(
                        "h-11 rounded-md border border-input bg-background px-3 text-base placeholder:text-muted-foreground sm:text-sm",
                        FORM_FOCUS_BORDER_CLASS
                      )}
                      placeholder="Launch workspace sharing"
                      maxLength={80}
                      disabled={isCreating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="create-epic-description" className="text-sm font-medium">
                      Description
                    </label>
                    <EmojiTextareaField
                      id="create-epic-description"
                      required
                      value={createDescription}
                      onChange={(event) => setCreateDescription(event.target.value)}
                      className={cn(
                        "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground sm:text-sm",
                        FORM_FOCUS_BORDER_CLASS
                      )}
                      placeholder="Explain the initiative and what success looks like."
                      maxLength={3000}
                      disabled={isCreating}
                    />
                  </div>
                  {createError ? (
                    <p
                      role="alert"
                      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                    >
                      {createError}
                    </p>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DialogClose asChild>
                      <Button type="button" variant="secondary" disabled={isCreating} className="min-h-11">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isCreating} className="min-h-11">
                      {isCreating ? "Creating..." : "Create epic"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("flex flex-col gap-4", PROJECT_SECTION_CONTENT_CLASS)}>
          {loadError ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
              {loadError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <ListSearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search name or description"
              ariaLabel="Search epics"
              clearAriaLabel="Clear epic search"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl<EpicListView>
                value={listView}
                onValueChange={(nextView) => {
                  if (nextView === listView) return;
                  setListView(nextView);
                  cancelEdit();
                }}
                ariaLabel="Epic list view"
                className="min-w-max flex-1 max-sm:[&>button]:px-2 max-sm:[&>button]:text-xs xl:flex-none"
                options={[
                  { value: "active", label: `Active (${activeEpics.length})` },
                  {
                    value: "archived",
                    label: `Archived (${archivedEpics.length})`,
                  },
                ]}
              />
            </div>
          </div>

          <p
            role="status"
            className={cn("text-sm text-muted-foreground", !listMessage && "sr-only")}
          >
            {listMessage}
          </p>

          {visibleEpics.length > 0 ? (
            <div
              role="region"
              aria-label="Epic list"
              tabIndex={0}
              className="max-h-[clamp(20rem,64dvh,42rem)] min-h-0 overflow-y-auto overscroll-y-contain rounded-lg border border-border/60 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div aria-hidden="true" className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_7rem_5rem_9rem] items-center gap-3 border-b border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Epic</span>
                <span>Completion</span>
                <span>Tasks</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-border/60">
                {visibleEpics.map((epic) => (
                  <article
                    key={epic.id}
                    aria-labelledby={`epic-${epic.id}-title`}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_9rem]"
                  >
                    <button
                      type="button"
                      aria-label={`Open epic ${epic.name}`}
                      aria-haspopup="dialog"
                      className="col-span-2 flex min-h-11 min-w-0 items-center gap-2.5 rounded-md text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-1"
                      onClick={(event) => {
                        actionTriggerRef.current = event.currentTarget;
                        setViewedEpicId(epic.id);
                      }}
                    >
                      <EpicColorMark name={epic.name} />
                      <h3 id={`epic-${epic.id}-title`} className="min-w-0 break-words text-sm font-semibold leading-6 [overflow-wrap:anywhere]">
                        {epic.name}
                      </h3>
                    </button>
                    <div className="min-w-0 space-y-1 text-sm tabular-nums sm:contents">
                      <div
                        role="progressbar"
                        aria-label={`${epic.name} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={epic.progressPercent}
                        aria-valuetext={`${epic.completedTaskCount} of ${epic.taskCount} tasks completed`}
                        className="space-y-1.5"
                      >
                        <span className="font-medium">
                          {epic.progressPercent}%
                          <span className="sr-only"> complete</span>
                        </span>
                        <div className="hidden h-1 w-20 overflow-hidden rounded-full bg-muted sm:block">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${epic.progressPercent}%` }} />
                        </div>
                      </div>
                      <span className="block text-xs text-muted-foreground sm:text-sm">
                        {epic.taskCount}
                        <span className="sm:sr-only"> {epic.taskCount === 1 ? "task" : "tasks"}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0"
                            aria-label={`Edit epic ${epic.name}`}
                            title="Edit epic"
                            onClick={(event) => {
                              actionTriggerRef.current = event.currentTarget;
                              startEdit(epic);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0"
                            disabled={isUpdatingArchive}
                            aria-label={`${epic.archivedAt ? "Restore" : "Archive"} epic ${epic.name}`}
                            title={epic.archivedAt ? "Restore epic" : "Archive epic"}
                            onClick={() => void handleToggleEpicArchived(epic, !epic.archivedAt)}
                          >
                            {epic.archivedAt ? (
                              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Archive className="h-4 w-4" aria-hidden="true" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-red-700 dark:hover:text-red-300"
                            aria-label={`Delete epic ${epic.name}`}
                            title="Delete epic"
                            disabled={!canDelete}
                            onClick={(event) => {
                              actionTriggerRef.current = event.currentTarget;
                              setPendingDeleteEpicId(epic.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}

      {viewedEpic ? (
        <EpicDetailsDialog
          projectId={projectId}
          epic={viewedEpic}
          onClose={() => setViewedEpicId(null)}
          onReturnFocus={returnActionFocus}
        />
      ) : null}

      <Dialog
        open={Boolean(editingEpic)}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          dismissible={!isSavingEdit}
          className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnActionFocus();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg">Edit epic</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Close epic editing"
              disabled={isSavingEdit}
              onClick={() => cancelEdit()}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isSavingEdit) void handleSaveEpic();
            }}
          >
            <div className="grid gap-2">
              <label htmlFor="edit-epic-name" className="text-sm font-medium">Name</label>
              <EmojiInputField
                id="edit-epic-name"
                autoFocus
                required
                value={editName}
                maxLength={80}
                disabled={isSavingEdit}
                onChange={(event) => setEditName(event.target.value)}
                className={cn("h-11 rounded-md border border-input bg-background px-3 text-base sm:text-sm", FORM_FOCUS_BORDER_CLASS)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-epic-description" className="text-sm font-medium">Description</label>
              <EmojiTextareaField
                id="edit-epic-description"
                required
                value={editDescription}
                maxLength={3000}
                disabled={isSavingEdit}
                onChange={(event) => setEditDescription(event.target.value)}
                className={cn("min-h-28 rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm", FORM_FOCUS_BORDER_CLASS)}
              />
            </div>
            {editError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="min-h-11" disabled={isSavingEdit} onClick={() => cancelEdit()}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={isSavingEdit}>{isSavingEdit ? "Saving..." : "Save epic"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteEpic)}
        title="Delete epic?"
        description={
          pendingDeleteEpic
            ? `Delete "${pendingDeleteEpic.name}"? Linked tasks will remain, but their epic link will be cleared.`
            : ""
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete epic"}
        onConfirm={() => void handleDeleteEpic()}
        onCancel={() => {
          if (isDeleting) {
            return;
          }

          setPendingDeleteEpicId(null);
        }}
        isConfirming={isDeleting}
      />
    </Card>
  );
}
