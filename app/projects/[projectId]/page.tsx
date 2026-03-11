import Link from "next/link";
import { CalendarDays, ChevronLeft, Columns3, PanelsTopLeft } from "lucide-react";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getStorageRuntimeConfig } from "@/lib/env.server";
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
  const actorUserId = await requireSessionUserIdFromServer();

  const project = await getProjectSummaryById(params.projectId, actorUserId);

  if (!project) {
    notFound();
  }

  const storageProvider = getStorageRuntimeConfig().provider;
  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);

  return (
    <main className="container space-y-8 py-10">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/70 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.65)] backdrop-blur-sm sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_36%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Project dashboard
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {project._count.tasks} tasks
                </Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {project.name}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {project.description ??
                    "Track work, keep context close to execution, and move project tasks across workflow stages without losing momentum."}
                </p>
              </div>
            </div>

            <Button asChild variant="outline" className="rounded-full px-4">
              <Link href="/projects">
                <ChevronLeft className="h-4 w-4" />
                Back to projects
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <DashboardSurfaceStat
              icon={Columns3}
              label="Execution board"
              value={`${project._count.tasks} tracked task${
                project._count.tasks === 1 ? "" : "s"
              }`}
            />
            <DashboardSurfaceStat
              icon={PanelsTopLeft}
              label="Workspace surfaces"
              value="Context, Kanban, and Calendar stay connected"
            />
            <DashboardSurfaceStat
              icon={CalendarDays}
              label="Flow model"
              value="Capture context, execute clearly, keep time in view"
            />
          </div>
        </div>
      </section>

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
          actorUserId={actorUserId}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<KanbanBoardSkeleton />}>
        <KanbanBoardSection
          projectId={project.id}
          actorUserId={actorUserId}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<ProjectCalendarPanelSkeleton />}>
        <ProjectCalendarPanelSection projectId={project.id} />
      </Suspense>
    </main>
  );
}

function DashboardSurfaceStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Columns3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="text-sm text-foreground/90">{value}</p>
    </div>
  );
}
