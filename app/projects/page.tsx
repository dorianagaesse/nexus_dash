import Link from "next/link";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";

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

import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  created: "Project created successfully.",
  updated: "Project updated successfully.",
  deleted: "Project deleted successfully.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "name-too-short": "Project name must be at least 2 characters long.",
  "missing-project-id": "Project identifier is missing.",
  "create-failed": "Could not create project. Please retry.",
  "update-failed": "Could not update project. Please retry.",
  "delete-failed": "Could not delete project. Please retry.",
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

async function getProjects() {
  return prisma.project.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: {
        select: {
          tasks: true,
          resources: true,
        },
      },
    },
  });
}

type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const projects = await getProjects();
  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Project management
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Project workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Create, update, and delete projects from one place.
          </p>
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
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create project
            </CardTitle>
            <CardDescription>
              New projects appear immediately in the list below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProjectAction} className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="create-name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="create-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="NexusDash MVP"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="create-description"
                  className="text-sm font-medium"
                >
                  Description
                </label>
                <textarea
                  id="create-description"
                  name="description"
                  rows={3}
                  maxLength={500}
                  placeholder="Optional project context..."
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Button type="submit">Create project</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {projects.length === 0 ? (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  No projects yet
                </CardTitle>
                <CardDescription>
                  Create your first project to start managing tasks and
                  resources.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {projects.map((project: ProjectRow) => (
            <Card key={project.id}>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {project._count.tasks} task
                    {project._count.tasks === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">
                    {project._count.resources} resource
                    {project._count.resources === 1 ? "" : "s"}
                  </Badge>
                </div>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  Updated {project.updatedAt.toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form action={updateProjectAction} className="grid gap-3">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="grid gap-2">
                    <label
                      htmlFor={`name-${project.id}`}
                      className="text-sm font-medium"
                    >
                      Name
                    </label>
                    <input
                      id={`name-${project.id}`}
                      name="name"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={project.name}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor={`description-${project.id}`}
                      className="text-sm font-medium"
                    >
                      Description
                    </label>
                    <textarea
                      id={`description-${project.id}`}
                      name="description"
                      rows={3}
                      maxLength={500}
                      defaultValue={project.description ?? ""}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="secondary">
                      <Pencil className="h-4 w-4" />
                      Save changes
                    </Button>
                  </div>
                </form>

                <form action={deleteProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <Button type="submit" variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete project
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <Button asChild variant="ghost">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
