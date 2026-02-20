import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStorageRuntimeConfig } from "@/lib/env.server";
import { getGoogleCalendarId } from "@/lib/google-calendar";
import { getProjectSummaryById } from "@/lib/services/project-service";
import { MAX_ATTACHMENT_FILE_SIZE_LABEL } from "@/lib/task-attachment";

import { KanbanBoardSection, KanbanBoardSkeleton } from "./kanban-board-section";
import {
  ProjectCalendarPanelSection,
  ProjectCalendarPanelSkeleton,
} from "./project-calendar-panel-section";
import {
  ProjectContextPanelSection,
  ProjectContextPanelSkeleton,
} from "./project-context-panel-section";

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
  "attachment-file-too-large": `Attachment files must be ${MAX_ATTACHMENT_FILE_SIZE_LABEL} or smaller.`,
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
  const project = await getProjectSummaryById(params.projectId);

  if (!project) {
    notFound();
  }

  const calendarId = getGoogleCalendarId();
  const storageProvider = getStorageRuntimeConfig().provider;
  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);

  return (
    <main className="container space-y-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Project dashboard</Badge>
            <Badge variant="outline">{project._count.tasks} tasks</Badge>
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

      <Suspense fallback={<ProjectContextPanelSkeleton />}>
        <ProjectContextPanelSection
          projectId={project.id}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<KanbanBoardSkeleton />}>
        <KanbanBoardSection
          projectId={project.id}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<ProjectCalendarPanelSkeleton />}>
        <ProjectCalendarPanelSection
          projectId={project.id}
          calendarId={calendarId}
        />
      </Suspense>
    </main>
  );
}
