import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { KanbanBoard, type KanbanTask } from "@/components/kanban-board";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { ProjectCalendarPanel } from "@/components/project-calendar-panel";
import { ProjectContextPanel } from "@/components/project-context-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getContextCardColorFromSeed } from "@/lib/context-card-colors";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { getProjectDashboardById } from "@/lib/services/project-service";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { isTaskStatus } from "@/lib/task-status";
import { getGoogleCalendarId } from "@/lib/google-calendar";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  "task-created": "Task created successfully.",
  "context-created": "Context card created successfully.",
  "context-updated": "Context card updated successfully.",
  "context-deleted": "Context card deleted successfully.",
  "calendar-connected": "Google Calendar connected successfully.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "title-too-short": "Task title must be at least 2 characters long.",
  "project-not-found": "Project not found.",
  "create-failed": "Could not create task. Please retry.",
  "attachment-link-invalid":
    "One or more attachment links are invalid. Use http:// or https:// URLs.",
  "attachment-file-too-large": "Attachment files must be 10MB or smaller.",
  "attachment-file-type-invalid":
    "Unsupported attachment file type. Use PDF, image, text, CSV, or JSON.",
  "context-card-missing": "Context card identifier is missing.",
  "context-card-not-found": "Context card not found.",
  "context-title-too-short": "Context card title must be at least 2 characters long.",
  "context-title-too-long": "Context card title must be 120 characters or fewer.",
  "context-content-too-long": "Context card content must be 4000 characters or fewer.",
  "context-color-invalid": "Selected context card color is invalid.",
  "context-create-failed": "Could not create context card. Please retry.",
  "context-update-failed": "Could not update context card. Please retry.",
  "context-delete-failed": "Could not delete context card. Please retry.",
  "calendar-config-missing":
    "Google Calendar OAuth configuration is incomplete in .env.",
  "calendar-auth-init-failed":
    "Could not start Google Calendar authentication. Please retry.",
  "calendar-auth-cancelled": "Google Calendar authentication was cancelled.",
  "calendar-auth-state-invalid":
    "Google Calendar authentication state check failed. Please retry.",
  "calendar-auth-code-missing":
    "Google Calendar callback did not return an authorization code.",
  "calendar-auth-failed":
    "Google Calendar authentication failed. Check OAuth credentials and test-user settings.",
};

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams?: SearchParams;
}) {
  const project = await getProjectDashboardById(params.projectId);

  if (!project) {
    notFound();
  }

  const kanbanTasks: KanbanTask[] = [];
  const archivedDoneTasks: KanbanTask[] = [];
  const existingLabelSet = new Set<string>();
  const contextCards = project.resources
    .filter((resource) => resource.type === RESOURCE_TYPE_CONTEXT_CARD)
    .map((resource) => ({
      id: resource.id,
      title: resource.name,
      content: resource.content,
      color: resource.color ?? getContextCardColorFromSeed(resource.id),
      attachments: resource.attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        url: attachment.url,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl:
          attachment.kind === ATTACHMENT_KIND_FILE
            ? `/api/projects/${project.id}/context-cards/${resource.id}/attachments/${attachment.id}/download`
            : null,
      })),
    }));

  project.tasks.forEach((task) => {
    if (!isTaskStatus(task.status)) {
      return;
    }

    const normalizedTask: KanbanTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
      blockedFollowUps: task.blockedFollowUps.map((entry) => ({
        id: entry.id,
        content: entry.content,
        createdAt: entry.createdAt.toISOString(),
      })),
      status: task.status,
      attachments: task.attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        url: attachment.url,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl:
          attachment.kind === ATTACHMENT_KIND_FILE
            ? `/api/projects/${project.id}/tasks/${task.id}/attachments/${attachment.id}/download`
            : null,
      })),
    };

    normalizedTask.labels.forEach((label) => {
      existingLabelSet.add(label);
    });

    if (task.status === "Done" && task.archivedAt) {
      archivedDoneTasks.push(normalizedTask);
      return;
    }

    kanbanTasks.push(normalizedTask);
  });

  const calendarId = getGoogleCalendarId();
  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);

  return (
    <main className="container space-y-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Project dashboard</Badge>
            <Badge variant="outline">{project.tasks.length} tasks</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {project.description ??
              "Track and move project tasks across workflow stages."}
          </p>
        </div>

        <Button asChild variant="ghost">
          <Link href="/projects">
            <ChevronLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>
      </div>

      {status && STATUS_MESSAGES[status] ? (
        <AutoDismissingAlert
          message={STATUS_MESSAGES[status]}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
        />
      ) : null}

      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <ProjectContextPanel
        projectId={project.id}
        cards={contextCards}
      />

      <KanbanBoard
        projectId={project.id}
        initialTasks={kanbanTasks}
        archivedDoneTasks={archivedDoneTasks}
        headerAction={
          <CreateTaskDialog
            projectId={project.id}
            existingLabels={Array.from(existingLabelSet)}
          />
        }
      />

      <ProjectCalendarPanel projectId={project.id} calendarId={calendarId} />
    </main>
  );
}
