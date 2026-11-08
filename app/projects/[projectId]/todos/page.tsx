import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ListTodo } from "lucide-react";

import {
  ProjectMeetingTodos,
  type ProjectMeetingTodoItem,
} from "@/components/meeting-todos/project-meeting-todos";
import { Badge } from "@/components/ui/badge";
import { ProjectChecklist } from "@/components/project-checklist";
import { listProjectTodos } from "@/lib/services/project-todo-service";
import type { ProjectTodoList } from "@/lib/project-todo";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { logServerError } from "@/lib/observability/logger";
import {
  listProjectMeetingTodos,
  type ProjectMeetingTodoList,
} from "@/lib/services/project-meeting-todo-service";

export const dynamic = "force-dynamic";

function serializeTodo(
  todo: ProjectMeetingTodoList["open"][number]
): ProjectMeetingTodoItem {
  return {
    id: todo.id,
    content: todo.content,
    completedAt: todo.completedAt?.toISOString() ?? null,
    assignedAt: todo.assignedAt?.toISOString() ?? null,
    updatedAt: todo.updatedAt.toISOString(),
    isOverdue: todo.isOverdue,
    creator: todo.creator,
    assignee: todo.assignee,
    assignedBy: todo.assignedBy,
    completedBy: todo.completedBy,
    participantOptions: todo.participantOptions,
    meeting: {
      ...todo.meeting,
      scheduledAt: todo.meeting.scheduledAt?.toISOString() ?? null,
    },
  };
}

export default async function ProjectTodosPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  noStore();
  const [{ projectId }, actorUserId] = await Promise.all([
    params,
    requireVerifiedSessionUserIdFromServer(),
  ]);
  let result: ProjectMeetingTodoList | null = null;
  let loadError: string | null = null;
  let checklist: ProjectTodoList | null = null;
  let checklistError: string | null = null;

  try {
    const response = await listProjectTodos({ actorUserId, projectId });
    if (response.ok) checklist = response.data;
  } catch (error) {
    logServerError("ProjectTodosPage.listProjectTodos", error, { projectId });
    checklistError = "Could not load the checklist. Refresh to retry.";
  }

  try {
    result = await listProjectMeetingTodos({ actorUserId, projectId });
  } catch (error) {
    logServerError("ProjectTodosPage.listProjectMeetingTodos", error, {
      projectId,
    });
    loadError = "Could not load meeting todos. Refresh to retry.";
  }

  if (!loadError && !checklistError && !result && !checklist) {
    notFound();
  }

  const initialTodos = result
    ? [...result.open, ...result.completed].map(serializeTodo)
    : [];

  return (
    <main className="container py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="space-y-4">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Project overview
          </Link>
          <Badge variant="secondary" className="w-fit gap-1.5">
            <ListTodo className="h-3.5 w-3.5" aria-hidden />
            {result?.project.name ?? "Current project"}
          </Badge>
          <div className="space-y-2">
            <h1 className="break-words text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              Todos
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Capture small actions in the checklist and review this
              project&apos;s meeting follow-ups.
            </p>
          </div>
        </div>

        {checklist && (
          <ProjectChecklist
            projectId={projectId}
            actorUserId={actorUserId}
            initialData={checklist}
          />
        )}
        {checklistError && (
          <p role="alert" className="text-sm text-destructive">
            {checklistError}
          </p>
        )}
        {(result || loadError) && (
          <section aria-label="Meeting follow-ups" className="space-y-4">
            <h2 className="text-xl font-semibold">Meeting follow-ups</h2>
            <ProjectMeetingTodos
              projectId={projectId}
              canEdit={result?.project.canEdit ?? false}
              currentActorUserId={result?.currentActorUserId ?? actorUserId}
              actors={result?.actors ?? []}
              initialTodos={initialTodos}
              loadError={loadError}
            />
          </section>
        )}
      </div>
    </main>
  );
}
