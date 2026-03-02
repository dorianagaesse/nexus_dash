import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { listProjectsWithCounts } from "@/lib/services/project-service";

import { type ProjectGridItem } from "./projects-grid-client";
import { ProjectsWorkspaceClient } from "./projects-workspace-client";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_MESSAGES: Record<string, string> = {
  created: "Project created successfully.",
  updated: "Project updated successfully.",
  deleted: "Project deleted successfully.",
  "email-verified": "Email verified. Your workspace is now fully unlocked.",
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You must be signed in to manage projects.",
  "email-unverified": "Verify your email to access project APIs and workspace actions.",
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

export default function ProjectsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const actorUserIdPromise = getSessionUserIdFromServer();
  return (
    <ProjectsPageContent actorUserIdPromise={actorUserIdPromise} searchParams={searchParams} />
  );
}

async function ProjectsPageContent({
  actorUserIdPromise,
  searchParams,
}: {
  actorUserIdPromise: Promise<string | null>;
  searchParams?: SearchParams;
}) {
  const actorUserId = await actorUserIdPromise;
  const projects = actorUserId ? await listProjectsWithCounts(actorUserId) : [];
  const projectCards: ProjectGridItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    updatedAtLabel: project.updatedAt.toLocaleString(),
    updatedAtIso: project.updatedAt.toISOString(),
    taskCount: project._count.tasks,
    resourceCount: project._count.resources,
  }));

  const status = readQueryValue(searchParams?.status);
  const error = readQueryValue(searchParams?.error);
  const statusMessage = status ? STATUS_MESSAGES[status] ?? null : null;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <ProjectsWorkspaceClient
      initialProjects={projectCards}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
    />
  );
}
