import Link from "next/link";
import { ChevronLeft, PlusSquare } from "lucide-react";
import { notFound } from "next/navigation";

import { KanbanBoard, type KanbanTask } from "@/components/kanban-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PlusSquare className="h-4 w-4" />
            Add task to Backlog
          </CardTitle>
          <CardDescription>
            New tasks enter the board in the Backlog column.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createTaskForProject} className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2 lg:col-span-1">
              <label htmlFor="task-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="task-title"
                name="title"
                required
                minLength={2}
                maxLength={120}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Implement drag sorting"
              />
            </div>

            <div className="grid gap-2 lg:col-span-1">
              <label htmlFor="task-label" className="text-sm font-medium">
                Label
              </label>
              <input
                id="task-label"
                name="label"
                maxLength={50}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Frontend"
              />
            </div>

            <div className="grid gap-2 lg:col-span-3">
              <label htmlFor="task-description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="task-description"
                name="description"
                rows={3}
                maxLength={500}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional implementation notes..."
              />
            </div>

            <div className="lg:col-span-3">
              <Button type="submit">Create task</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <KanbanBoard projectId={project.id} initialTasks={kanbanTasks} />
    </main>
  );
}
