"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Pencil,
  PlusSquare,
  Trash2,
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
import {
  EmojiInputField,
  EmojiTextareaField,
} from "@/components/ui/emoji-field";
import { getEpicColorFromName } from "@/lib/epic";
import { useProjectSectionExpanded } from "@/lib/hooks/use-project-section-expanded";
import { cn } from "@/lib/utils";

interface ProjectEpicPanelTask {
  id: string;
  title: string;
  status: string;
  archivedAt: string | null;
}

export interface ProjectEpicPanelEpic {
  id: string;
  name: string;
  description: string;
  status: "Ready" | "In progress" | "Completed";
  progressPercent: number;
  taskCount: number;
  completedTaskCount: number;
  linkedTasks: ProjectEpicPanelTask[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectEpicPanelProps {
  projectId: string;
  canEdit: boolean;
  epics: ProjectEpicPanelEpic[];
  loadError?: string | null;
}

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
    default:
      return "Could not save epic changes. Please retry.";
  }
}

function EpicStatusBadge({
  status,
}: {
  status: ProjectEpicPanelEpic["status"];
}) {
  const toneClass =
    status === "Completed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
      : status === "In progress"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";

  return (
    <Badge variant="outline" className={toneClass}>
      {status}
    </Badge>
  );
}

function EpicTaskRow({
  task,
  className,
}: {
  task: ProjectEpicPanelTask;
  className?: string;
}) {
  const toneClass =
    task.archivedAt != null || task.status === "Done"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
      : task.status === "In Progress"
        ? "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-200"
        : task.status === "Blocked"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          : "border-border/60 bg-background/70 text-muted-foreground";

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
        "bg-background/65",
        className
      )}
    >
      <span className="min-w-0 break-words text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
        {task.title}
      </span>
      <span
        className={cn(
          "w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
          toneClass
        )}
      >
        {task.archivedAt != null ? "Archived" : task.status}
      </span>
    </li>
  );
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
  const [localEpics, setLocalEpics] = useState<ProjectEpicPanelEpic[]>(epics);
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
  const [expandedLinkedTaskEpicIds, setExpandedLinkedTaskEpicIds] = useState<
    Set<string>
  >(() => new Set());

  useEffect(() => {
    setLocalEpics(epics);
  }, [epics]);

  const editingEpic = useMemo(
    () => localEpics.find((epic) => epic.id === editingEpicId) ?? null,
    [editingEpicId, localEpics]
  );

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

  const toggleLinkedTasks = (epicId: string) => {
    setExpandedLinkedTaskEpicIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(epicId)) {
        nextIds.delete(epicId);
      } else {
        nextIds.add(epicId);
      }

      return nextIds;
    });
  };

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
      const response = await fetch(`/api/projects/${projectId}/epics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          description: normalizedDescription,
        }),
      });

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
      setLocalEpics((previousEpics) => [createdEpic, ...previousEpics]);
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
      const response = await fetch(
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
      const response = await fetch(
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

  return (
    <Card
      className={PROJECT_SECTION_CARD_CLASS}
      data-project-live-refresh-lock={
        isCreateOpen ||
        isCreating ||
        Boolean(editingEpicId) ||
        isSavingEdit ||
        Boolean(pendingDeleteEpicId) ||
        isDeleting
          ? "true"
          : undefined
      }
    >
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
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
              {localEpics.length} epic{localEpics.length === 1 ? "" : "s"}
            </span>
          </button>

          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => {
                resetCreateDraft();
                setIsExpanded(true);
                setIsCreateOpen(true);
              }}
            >
              <PlusSquare className="h-4 w-4" />
              New epic
            </Button>
          ) : null}
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent className={cn("space-y-4", PROJECT_SECTION_CONTENT_CLASS)}>
          {loadError ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
              {loadError}
            </div>
          ) : null}

          {isCreateOpen ? (
            <section className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Create epic</h3>
                <p className="text-xs text-muted-foreground">
                  Give the initiative a clear flag and enough context to stay
                  useful on the project page.
                </p>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label
                    htmlFor="create-epic-name"
                    className="text-sm font-medium"
                  >
                    Name
                  </label>
                  <EmojiInputField
                    id="create-epic-name"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Launch workspace sharing"
                    maxLength={80}
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    htmlFor="create-epic-description"
                    className="text-sm font-medium"
                  >
                    Description
                  </label>
                  <EmojiTextareaField
                    id="create-epic-description"
                    value={createDescription}
                    onChange={(event) =>
                      setCreateDescription(event.target.value)
                    }
                    className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Explain the initiative and what success looks like."
                    maxLength={3000}
                  />
                </div>
              </div>
              {createError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createError}
                </div>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => closeCreate()}
                  disabled={isCreating}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCreateEpic()}
                  disabled={isCreating}
                  className="w-full sm:w-auto"
                >
                  {isCreating ? "Creating..." : "Create epic"}
                </Button>
              </div>
            </section>
          ) : null}

          {localEpics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                No epics yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one to group related work under a clear initiative.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {localEpics.map((epic) => {
                const color = getEpicColorFromName(epic.name);
                const isEditing = editingEpicId === epic.id;
                const isLinkedTaskListExpanded = expandedLinkedTaskEpicIds.has(
                  epic.id
                );
                const hiddenTaskCount = Math.max(
                  0,
                  epic.linkedTasks.length - 6
                );
                const titleId = `epic-${epic.id}-title`;
                const linkedTasksId = `epic-${epic.id}-linked-tasks`;

                return (
                  <article
                    key={epic.id}
                    aria-label={isEditing ? `Edit epic ${epic.name}` : undefined}
                    aria-labelledby={isEditing ? undefined : titleId}
                    className="min-w-0 overflow-hidden rounded-2xl border bg-card/85 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)] backdrop-blur-sm"
                    style={{
                      borderColor: color.border,
                    }}
                  >
                    <div
                      className="h-1.5 w-full"
                      style={{
                        backgroundColor: color.accent,
                      }}
                    />
                    {isEditing ? (
                      <div className="space-y-3 p-4">
                        <div className="grid gap-2">
                          <label
                            htmlFor={`edit-epic-name-${epic.id}`}
                            className="text-sm font-medium"
                          >
                            Name
                          </label>
                          <EmojiInputField
                            id={`edit-epic-name-${epic.id}`}
                            value={editName}
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            maxLength={80}
                          />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor={`edit-epic-description-${epic.id}`}
                            className="text-sm font-medium"
                          >
                            Description
                          </label>
                          <EmojiTextareaField
                            id={`edit-epic-description-${epic.id}`}
                            value={editDescription}
                            onChange={(event) =>
                              setEditDescription(event.target.value)
                            }
                            className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            maxLength={3000}
                          />
                        </div>
                        {editError ? (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {editError}
                          </div>
                        ) : null}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => cancelEdit()}
                            disabled={isSavingEdit}
                            className="w-full sm:w-auto"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleSaveEpic()}
                            disabled={isSavingEdit}
                            className="w-full sm:w-auto"
                          >
                            {isSavingEdit ? "Saving..." : "Save epic"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                id={titleId}
                                className="min-w-0 break-words text-lg font-semibold leading-7 tracking-tight text-foreground [overflow-wrap:anywhere]"
                              >
                                {epic.name}
                              </h3>
                              <EpicStatusBadge status={epic.status} />
                            </div>
                            <p className="max-w-3xl whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground [overflow-wrap:anywhere]">
                              {epic.description}
                            </p>
                          </div>
                          {canEdit ? (
                            <div className="flex shrink-0 self-end items-center gap-2 sm:self-auto">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11"
                                onClick={() => startEdit(epic)}
                                aria-label={`Edit epic ${epic.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11"
                                onClick={() => setPendingDeleteEpicId(epic.id)}
                                aria-label={`Delete epic ${epic.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(20rem,1.2fr)] xl:items-start">
                          <section
                            aria-label={`Progress for ${epic.name}`}
                            className="space-y-3 rounded-xl border border-border/50 bg-background/70 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Progress
                              </h4>
                              <p className="text-base font-semibold tabular-nums text-foreground">
                                {epic.progressPercent}%
                              </p>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${epic.name} progress`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={epic.progressPercent}
                              aria-valuetext={`${epic.completedTaskCount} of ${epic.taskCount} tasks completed`}
                              className="h-2.5 overflow-hidden rounded-full bg-muted"
                            >
                              <div
                                className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
                                style={{
                                  width: `${epic.progressPercent}%`,
                                  backgroundColor: color.accent,
                                }}
                              />
                            </div>
                            <p className="text-sm leading-5 text-muted-foreground">
                              <span className="font-medium tabular-nums text-foreground">
                                {epic.completedTaskCount}/{epic.taskCount}
                              </span>{" "}
                              task{epic.taskCount === 1 ? "" : "s"} completed
                            </p>
                          </section>

                          <section className="min-w-0 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Linked tasks
                              </h4>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {epic.taskCount} total
                              </span>
                            </div>
                            {epic.linkedTasks.length > 0 ? (
                              <>
                                <ul
                                  id={linkedTasksId}
                                  className="grid min-w-0 gap-2 xl:grid-cols-2"
                                >
                                  {epic.linkedTasks.map((task, taskIndex) => (
                                    <EpicTaskRow
                                      key={task.id}
                                      task={task}
                                      className={cn(
                                        taskIndex >= 6 &&
                                          !isLinkedTaskListExpanded &&
                                          "lg:hidden"
                                      )}
                                    />
                                  ))}
                                </ul>
                                {hiddenTaskCount > 0 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="hidden min-h-11 w-full justify-center text-muted-foreground lg:inline-flex"
                                    aria-expanded={isLinkedTaskListExpanded}
                                    aria-controls={linkedTasksId}
                                    onClick={() => toggleLinkedTasks(epic.id)}
                                  >
                                    {isLinkedTaskListExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                    {isLinkedTaskListExpanded
                                      ? "Show fewer linked tasks"
                                      : `Show ${hiddenTaskCount} more linked task${
                                          hiddenTaskCount === 1 ? "" : "s"
                                        }`}
                                  </Button>
                                ) : null}
                              </>
                            ) : (
                              <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                                No tasks linked yet.
                              </p>
                            )}
                          </section>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      ) : null}

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
