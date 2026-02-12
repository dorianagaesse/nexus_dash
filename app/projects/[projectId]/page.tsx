import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { KanbanBoard, type KanbanTask } from "@/components/kanban-board";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { ProjectContextPanel } from "@/components/project-context-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getContextCardColorFromSeed } from "@/lib/context-card-colors";
import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { isTaskStatus } from "@/lib/task-status";

import {
  createContextCardAction,
  createTaskAction,
  deleteContextCardAction,
  updateContextCardAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;
const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

const STATUS_MESSAGES: Record<string, string> = {
  "task-created": "Task created successfully.",
  "context-created": "Context card created successfully.",
  "context-updated": "Context card updated successfully.",
  "context-deleted": "Context card deleted successfully.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "title-too-short": "Task title must be at least 2 characters long.",
  "project-not-found": "Project not found.",
  "create-failed": "Could not create task. Please retry.",
  "context-card-missing": "Context card identifier is missing.",
  "context-card-not-found": "Context card not found.",
  "context-title-too-short": "Context card title must be at least 2 characters long.",
  "context-title-too-long": "Context card title must be 120 characters or fewer.",
  "context-content-too-long": "Context card content must be 4000 characters or fewer.",
  "context-color-invalid": "Selected context card color is invalid.",
  "context-create-failed": "Could not create context card. Please retry.",
  "context-update-failed": "Could not update context card. Please retry.",
  "context-delete-failed": "Could not delete context card. Please retry.",
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

async function getProject(projectId: string) {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);

  await prisma.task.updateMany({
    where: {
      projectId,
      status: "Done",
      archivedAt: null,
      OR: [
        { completedAt: { lte: archiveThreshold } },
        { completedAt: null, updatedAt: { lte: archiveThreshold } },
      ],
    },
    data: {
      archivedAt: new Date(),
    },
  });

  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
      resources: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
    },
  });
}

export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams?: SearchParams;
}) {
  const project = await getProject(params.projectId);

  if (!project) {
    notFound();
  }

  const kanbanTasks: KanbanTask[] = [];
  const archivedDoneTasks: KanbanTask[] = [];
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
      blockedNote: task.blockedNote,
      label: task.label,
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

    if (task.status === "Done" && task.archivedAt) {
      archivedDoneTasks.push(normalizedTask);
      return;
    }

    kanbanTasks.push(normalizedTask);
  });

  const createTaskForProject = createTaskAction.bind(null, project.id);
  const createContextCardForProject = createContextCardAction.bind(null, project.id);
  const updateContextCardForProject = updateContextCardAction.bind(null, project.id);
  const deleteContextCardForProject = deleteContextCardAction.bind(null, project.id);
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <ProjectContextPanel
        projectId={project.id}
        cards={contextCards}
        createAction={createContextCardForProject}
        updateAction={updateContextCardForProject}
        deleteAction={deleteContextCardForProject}
      />

      <KanbanBoard
        projectId={project.id}
        initialTasks={kanbanTasks}
        archivedDoneTasks={archivedDoneTasks}
        headerAction={<CreateTaskDialog action={createTaskForProject} />}
      />
    </main>
  );
}
