import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { KanbanBoard, type KanbanTask } from "@/components/kanban-board";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { isTaskStatus } from "@/lib/task-status";

import { createTaskAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  "task-created": "Task created successfully.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "title-too-short": "Task title must be at least 2 characters long.",
  "project-not-found": "Project not found.",
  "create-failed": "Could not create task. Please retry.",
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
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
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

  project.tasks.forEach((task) => {
    if (!isTaskStatus(task.status)) {
      return;
    }

    kanbanTasks.push({
      id: task.id,
      title: task.title,
      description: task.description,
      label: task.label,
      status: task.status,
    });
  });

  const createTaskForProject = createTaskAction.bind(null, project.id);
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
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {STATUS_MESSAGES[status]}
        </div>
      ) : null}

      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card className="border-dashed border-border/60 bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardDescription>
            Add tasks without taking space from your board.
          </CardDescription>
          <CreateTaskDialog action={createTaskForProject} />
        </div>
      </Card>

      <KanbanBoard projectId={project.id} initialTasks={kanbanTasks} />
    </main>
  );
}
