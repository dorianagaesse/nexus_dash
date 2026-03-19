import { FolderKanban } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { listProjectsWithCounts } from "@/lib/services/project-service";

import { ProjectsGridClient } from "./projects-grid-client";
import { deleteProjectAction, updateProjectAction } from "./actions";

export async function ProjectsGrid() {
  const actorUserId = await getSessionUserIdFromServer();
  const projects = actorUserId ? await listProjectsWithCounts(actorUserId) : [];
  const projectCards = projects.map((project) => ({
    role:
      project.ownerId === actorUserId
        ? "owner"
        : (project.memberships[0]?.role ?? "viewer"),
    id: project.id,
    name: project.name,
    description: project.description,
    updatedAtLabel: project.updatedAt.toLocaleString(),
    taskCount: project._count.tasks,
    resourceCount: project._count.resources,
  }));

  return (
    <>
      {projectCards.length === 0 ? (
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
      ) : (
        <ProjectsGridClient
          projects={projectCards}
          onUpdateProject={updateProjectAction}
          onDeleteProject={deleteProjectAction}
        />
      )}
    </>
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
