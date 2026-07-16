import Link from "next/link";
import {
  CheckCheck,
  ChevronLeft,
  FileStack,
  PanelsTopLeft,
  ClipboardList,
  TimerReset,
} from "lucide-react";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { ProjectCollaborationPresence } from "@/components/project-dashboard/project-collaboration-presence";
import { ProjectDashboardOwnerActions } from "@/components/project-dashboard/project-dashboard-owner-actions";
import { ProjectLiveRefresh } from "@/components/project-live-refresh";
import { CalendarSummaryStatCard } from "@/components/project-dashboard/calendar-summary-stat-card";
import { DashboardStatCard } from "@/components/project-dashboard/dashboard-stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { getStorageRuntimeConfig } from "@/lib/env.server";
import {
  getProjectSummaryById,
  listProjectCollaborators,
} from "@/lib/services/project-service";
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
import {
  ProjectEpicPanelSection,
  ProjectEpicPanelSkeleton,
} from "./project-epic-panel-section";
import {
  ProjectMeetingNotesPanelSection,
  ProjectMeetingNotesPanelSkeleton,
} from "./project-meeting-notes-panel-section";
import {
  ProjectRoadmapPanelSection,
  ProjectRoadmapPanelSkeleton,
} from "./project-roadmap-panel-section";

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

  const [project, collaborators] = await Promise.all([
    getProjectSummaryById(resolvedParams.projectId, actorUserId),
    listProjectCollaborators(resolvedParams.projectId, actorUserId),
  ]);

  if (!project) {
    notFound();
  }

  const storageProvider = getStorageRuntimeConfig().provider;
  const status = readQueryValue(resolvedSearchParams?.status);
  const error = readQueryValue(resolvedSearchParams?.error);
  const initialTaskId = readQueryValue(resolvedSearchParams?.taskId);
  const actorRole =
    project.ownerId === actorUserId ? "owner" : (project.memberships[0]?.role ?? "viewer");
  const canEditProjectContent = actorRole === "owner" || actorRole === "editor";

  return (
    <main className="container space-y-6 py-6 sm:space-y-8 sm:py-10">
      <ProjectLiveRefresh
        projectId={project.id}
        initialVersion={project.updatedAt.toISOString()}
      />

      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 px-4 py-4 shadow-[0_20px_64px_-48px_rgba(15,23,42,0.6)] backdrop-blur-sm sm:px-6 sm:py-5 lg:rounded-3xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_36%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9 rounded-lg px-2 lg:hidden">
                  <Link href="/projects">
                    <ChevronLeft className="h-4 w-4" />
                    All projects
                  </Link>
                </Button>
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
                <h1 className="break-words text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl lg:text-[2.5rem]">
                  {project.name}
                </h1>
                {project.description ? (
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {project.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:w-auto lg:max-w-[32rem] lg:flex-col lg:items-end">
              <ProjectCollaborationPresence
                members={collaborators}
                actorUserId={actorUserId}
              />

              <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
                {actorRole === "owner" ? (
                  <ProjectDashboardOwnerActions
                    projectId={project.id}
                    projectName={project.name}
                    projectDescription={project.description}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-6">
            <DashboardStatCard
              icon={TimerReset}
              label="Open"
              value={project.stats.openTasks}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
              valueClassName="text-sky-700 dark:text-sky-100"
            />
            <DashboardStatCard
              icon={CheckCheck}
              label="Completed"
              value={project.stats.completedTasks}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
              valueClassName="text-emerald-700 dark:text-emerald-100"
            />
            <DashboardStatCard
              icon={PanelsTopLeft}
              label="Context"
              value={project.stats.contextCards}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
            />
            <DashboardStatCard
              icon={ClipboardList}
              label="Meeting notes"
              value={project.stats.meetingNotes}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
            />
            <DashboardStatCard
              icon={FileStack}
              label="Attachments"
              value={project.stats.attachmentCount}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
            />
            <CalendarSummaryStatCard
              isConnected={project.stats.isCalendarConnected}
              className="w-[8.75rem] shrink-0 snap-start md:w-auto"
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

      <Suspense fallback={<ProjectMeetingNotesPanelSkeleton />}>
        <ProjectMeetingNotesPanelSection
          projectId={project.id}
          actorUserId={actorUserId}
          canEdit={canEditProjectContent}
        />
      </Suspense>

      <Suspense fallback={<ProjectEpicPanelSkeleton />}>
        <ProjectEpicPanelSection
          projectId={project.id}
          actorUserId={actorUserId}
          canEdit={canEditProjectContent}
        />
      </Suspense>

      <Suspense fallback={<KanbanBoardSkeleton />}>
        <KanbanBoardSection
          projectId={project.id}
          actorUserId={actorUserId}
          canEdit={canEditProjectContent}
          storageProvider={storageProvider}
          collaborators={collaborators}
          initialTaskId={initialTaskId}
        />
      </Suspense>

      <Suspense fallback={<ProjectRoadmapPanelSkeleton />}>
        <ProjectRoadmapPanelSection
          projectId={project.id}
          actorUserId={actorUserId}
          canEdit={canEditProjectContent}
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
