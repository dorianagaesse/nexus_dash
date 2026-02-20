import Link from "next/link";
import { ArrowRight, FolderKanban, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listProjectsWithCounts,
  type ProjectWithCounts,
} from "@/lib/services/project-service";

import { deleteProjectAction, updateProjectAction } from "./actions";

type ProjectRow = ProjectWithCounts;

export async function ProjectsGrid() {
  const projects = await listProjectsWithCounts();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.length === 0 ? (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              No projects yet
            </CardTitle>
            <CardDescription>
              Create your first project to start managing tasks and resources.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {projects.map((project: ProjectRow) => (
        <Card key={project.id}>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {project._count.tasks} task{project._count.tasks === 1 ? "" : "s"}
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
            <Button asChild>
              <Link href={`/projects/${project.id}`} prefetch>
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <form action={updateProjectAction} className="grid gap-3">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="grid gap-2">
                <label htmlFor={`name-${project.id}`} className="text-sm font-medium">
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
  );
}

export function ProjectsGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="space-y-3">
            <div className="flex gap-2">
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-3">
              <div className="grid gap-2">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="grid gap-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
              </div>
            </div>
            <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
