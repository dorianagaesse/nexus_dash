"use client";

import { useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/toast-provider";
import { createClientTimer } from "@/lib/client-performance";

import { ProjectsGridClient, type ProjectGridItem } from "./projects-grid-client";

interface ProjectsWorkspaceClientProps {
  initialProjects: ProjectGridItem[];
  statusMessage: string | null;
  errorMessage: string | null;
}

interface ProjectMutationResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
    taskCount: number;
    resourceCount: number;
  };
}

function readErrorCode(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return "";
}

function mapProjectErrorCode(errorCode: string, fallback: string): string {
  switch (errorCode) {
    case "name-too-short":
      return "Project name must be at least 2 characters long.";
    case "missing-project-id":
      return "Project identifier is missing.";
    case "project-not-found":
      return "Project not found.";
    case "forbidden":
      return "You do not have permission to modify this project.";
    case "unauthorized":
      return "You must be signed in to manage projects.";
    case "create-failed":
      return "Could not create project. Please retry.";
    case "update-failed":
      return "Could not update project. Please retry.";
    case "delete-failed":
      return "Could not delete project. Please retry.";
    default:
      return fallback;
  }
}

function mapApiProjectToGridItem(project: ProjectMutationResponse["project"]): ProjectGridItem {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    updatedAtLabel: new Date(project.updatedAt).toLocaleString(),
    updatedAtIso: project.updatedAt,
    taskCount: project.taskCount,
    resourceCount: project.resourceCount,
  };
}

function sortProjects(projects: ProjectGridItem[]): ProjectGridItem[] {
  return [...projects].sort((a, b) => {
    const left = new Date(a.updatedAtIso ?? 0).getTime();
    const right = new Date(b.updatedAtIso ?? 0).getTime();
    return right - left;
  });
}

export function ProjectsWorkspaceClient({
  initialProjects,
  statusMessage,
  errorMessage,
}: ProjectsWorkspaceClientProps) {
  const { pushToast } = useToast();
  const [projects, setProjects] = useState<ProjectGridItem[]>(() =>
    sortProjects(initialProjects)
  );

  const hasProjects = projects.length > 0;

  const emptyState = useMemo(
    () => (
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
    ),
    []
  );

  const createProject = async (input: { name: string; description: string }) => {
    const timer = createClientTimer("project.create");
    const nowIso = new Date().toISOString();
    const temporaryProjectId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticProject: ProjectGridItem = {
      id: temporaryProjectId,
      name: input.name,
      description: input.description || null,
      updatedAtLabel: "Just now",
      updatedAtIso: nowIso,
      taskCount: 0,
      resourceCount: 0,
    };

    setProjects((previous) => sortProjects([optimisticProject, ...previous]));

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ProjectMutationResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message = mapProjectErrorCode(
          readErrorCode(payload),
          "Could not create project. Please retry."
        );
        throw new Error(message);
      }

      if (!payload || !("project" in payload) || !payload.project) {
        throw new Error("Could not create project. Please retry.");
      }

      const createdProject = mapApiProjectToGridItem(payload.project);
      setProjects((previous) =>
        sortProjects(
          previous.map((project) =>
            project.id === temporaryProjectId ? createdProject : project
          )
        )
      );

      pushToast({
        variant: "success",
        message: "Project created.",
      });
      timer.end({ status: "success" });
    } catch (error) {
      setProjects((previous) =>
        previous.filter((project) => project.id !== temporaryProjectId)
      );
      timer.end({ status: "failed" });
      throw error;
    }
  };

  const updateProject = async (input: {
    projectId: string;
    name: string;
    description: string;
  }) => {
    const timer = createClientTimer("project.update");
    const previousProject = projects.find((project) => project.id === input.projectId);
    if (!previousProject) {
      throw new Error("Project not found.");
    }

    const nowIso = new Date().toISOString();
    setProjects((previous) =>
      sortProjects(
        previous.map((project) =>
          project.id === input.projectId
            ? {
                ...project,
                name: input.name,
                description: input.description || null,
                updatedAtIso: nowIso,
                updatedAtLabel: "Just now",
              }
            : project
        )
      )
    );

    try {
      const response = await fetch(`/api/projects/${input.projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ProjectMutationResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message = mapProjectErrorCode(
          readErrorCode(payload),
          "Could not update project. Please retry."
        );
        throw new Error(message);
      }

      if (!payload || !("project" in payload) || !payload.project) {
        throw new Error("Could not update project. Please retry.");
      }

      const updatedProject = mapApiProjectToGridItem(payload.project);
      setProjects((previous) =>
        sortProjects(
          previous.map((project) =>
            project.id === input.projectId ? updatedProject : project
          )
        )
      );

      pushToast({
        variant: "success",
        message: "Project updated.",
      });
      timer.end({ status: "success" });
    } catch (error) {
      setProjects((previous) =>
        sortProjects(
          previous.map((project) =>
            project.id === previousProject.id ? previousProject : project
          )
        )
      );
      timer.end({ status: "failed" });
      throw error;
    }
  };

  const deleteProject = async (projectId: string) => {
    const timer = createClientTimer("project.delete");
    const previousProjects = projects;
    const deletedProject = previousProjects.find((project) => project.id === projectId);

    setProjects((previous) => previous.filter((project) => project.id !== projectId));

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        const message = mapProjectErrorCode(
          readErrorCode(payload),
          "Could not delete project. Please retry."
        );
        throw new Error(message);
      }

      pushToast({
        variant: "success",
        message: "Project deleted.",
      });
      timer.end({ status: "success" });
    } catch (error) {
      if (deletedProject) {
        setProjects(() => sortProjects(previousProjects));
      }
      timer.end({ status: "failed" });
      throw error;
    }
  };

  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Project management
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Project workspace</h1>
          <p className="text-sm text-muted-foreground">
            Create, update, and delete projects from one place.
          </p>
        </div>

        {statusMessage ? (
          <AutoDismissingAlert
            message={statusMessage}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
          />
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div>
          <CreateProjectDialog onCreateProject={createProject} />
        </div>

        {hasProjects ? (
          <ProjectsGridClient
            projects={projects}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : (
          emptyState
        )}
      </div>
    </main>
  );
}
