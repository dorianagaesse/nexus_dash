import Link from "next/link";
import {
  CheckCheck,
  ChevronLeft,
  FileStack,
  PanelsTopLeft,
  TimerReset,
} from "lucide-react";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { ProjectDashboardOwnerActions } from "@/components/project-dashboard/project-dashboard-owner-actions";
import { CalendarSummaryStatCard } from "@/components/project-dashboard/calendar-summary-stat-card";
import { DashboardStatCard } from "@/components/project-dashboard/dashboard-stat-card";
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
  "invitation-accepted": "Project invitation accepted.",
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
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const actorUserId = await requireSessionUserIdFromServer();

  const project = await getProjectSummaryById(resolvedParams.projectId, actorUserId);

  if (!project) {
    notFound();
  }

  const storageProvider = getStorageRuntimeConfig().provider;
  const status = readQueryValue(resolvedSearchParams?.status);
  const error = readQueryValue(resolvedSearchParams?.error);
  const actorRole =
    project.ownerId === actorUserId ? "owner" : (project.memberships[0]?.role ?? "viewer");
  const canEditProjectContent = actorRole === "owner" || actorRole === "editor";

  return (
    <main className="container space-y-6 py-6 sm:space-y-8 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/75 px-4 py-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.65)] backdrop-blur-sm sm:px-8 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_36%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Project dashboard
                </Badge>
                <Badge
                  variant={actorRole === "owner" ? "secondary" : "outline"}
                  className="rounded-full px-3 py-1 capitalize"
                >
                  {actorRole}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {project.stats.trackedTasks} task
                  {project.stats.trackedTasks === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.85rem]">
                  {project.name}
                </h1>
                {project.description ? (
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {project.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
              {actorRole === "owner" ? (
                <ProjectDashboardOwnerActions
                  projectId={project.id}
                  projectName={project.name}
                  projectDescription={project.description}
                />
              ) : null}
              <Button asChild variant="outline" className="w-full rounded-full px-4 sm:w-auto">
                <Link href="/projects">
                  <ChevronLeft className="h-4 w-4" />
                  Back to projects
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
            <DashboardStatCard
              icon={TimerReset}
              label="Open"
              value={project.stats.openTasks}
              className="lg:col-span-3"
              valueClassName="text-sky-700 dark:text-sky-100"
            />
            <DashboardStatCard
              icon={CheckCheck}
              label="Completed"
              value={project.stats.completedTasks}
              className="lg:col-span-3"
              valueClassName="text-emerald-700 dark:text-emerald-100"
            />
            <DashboardStatCard
              icon={PanelsTopLeft}
              label="Context"
              value={project.stats.contextCards}
              className="lg:col-span-2"
            />
            <DashboardStatCard
              icon={FileStack}
              label="Attachments"
              value={project.stats.attachmentCount}
              className="lg:col-span-2"
            />
            <CalendarSummaryStatCard
              isConnected={project.stats.isCalendarConnected}
              className="col-span-2 lg:col-span-2"
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
          canEdit={canEditProjectContent}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<KanbanBoardSkeleton />}>
        <KanbanBoardSection
          projectId={project.id}
          actorUserId={actorUserId}
          canEdit={canEditProjectContent}
          storageProvider={storageProvider}
        />
      </Suspense>

      <Suspense fallback={<ProjectCalendarPanelSkeleton />}>
        <ProjectCalendarPanelSection
          projectId={project.id}
          canEdit={canEditProjectContent}
        />
      </Suspense>
    </main>
  );
}
