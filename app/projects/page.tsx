import Link from "next/link";
import { Suspense } from "react";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { createProjectAction } from "./actions";
import { ProjectsGrid, ProjectsGridSkeleton } from "./projects-grid";

export const dynamic = "force-dynamic";

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

export default function ProjectsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
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

        <div>
          <CreateProjectDialog action={createProjectAction} />
        </div>

        <Suspense fallback={<ProjectsGridSkeleton />}>
          <ProjectsGrid />
        </Suspense>

        <div>
          <Button asChild variant="ghost">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
