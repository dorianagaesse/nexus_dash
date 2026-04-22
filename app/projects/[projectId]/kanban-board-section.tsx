import { Columns3 } from "lucide-react";

import {
  KanbanBoard,
  type KanbanTask,
} from "@/components/kanban-board";
import type { ProjectEpicOption } from "@/components/kanban-board-types";
import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listProjectCollaborators,
  listProjectKanbanTasks,
} from "@/lib/services/project-service";
import { listProjectEpics } from "@/lib/services/project-epic-service";
import { mapTaskEpicSummary } from "@/lib/epic";
import { mapTaskPersonSummary } from "@/lib/task-person";
import { mapRelatedTaskSummary } from "@/lib/task-related";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { formatTaskDeadlineDate } from "@/lib/task-deadline";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { isTaskStatus } from "@/lib/task-status";

type ProjectKanbanTask = Awaited<ReturnType<typeof listProjectKanbanTasks>>[number];
type TaskAttachment = ProjectKanbanTask["attachments"][number];
type TaskBlockedFollowUp =
  ProjectKanbanTask["blockedFollowUps"][number];
type OutgoingRelation = ProjectKanbanTask["outgoingRelations"][number];
type IncomingRelation = ProjectKanbanTask["incomingRelations"][number];

interface KanbanBoardSectionProps {
  projectId: string;
  actorUserId: string;
  canEdit: boolean;
  storageProvider: "local" | "r2";
}

export async function KanbanBoardSection({
  projectId,
  actorUserId,
  canEdit,
  storageProvider,
}: KanbanBoardSectionProps) {
  const [tasks, collaborators, epics] = await Promise.all([
    listProjectKanbanTasks(projectId, actorUserId),
    listProjectCollaborators(projectId, actorUserId),
    listProjectEpics(projectId, actorUserId),
  ]);
  const kanbanTasks: KanbanTask[] = [];
  const archivedDoneTasks: KanbanTask[] = [];
  const epicOptions: ProjectEpicOption[] = epics.map((epic) => ({
    id: epic.id,
    name: epic.name,
    status: epic.status,
    progressPercent: epic.progressPercent,
    taskCount: epic.taskCount,
  }));

  tasks.forEach((task: ProjectKanbanTask) => {
    if (!isTaskStatus(task.status)) {
      return;
    }

    const normalizedTask: KanbanTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
      commentCount: task._count.comments,
      labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
      blockedFollowUps: task.blockedFollowUps.map((entry: TaskBlockedFollowUp) => ({
        id: entry.id,
        content: entry.content,
        createdAt: entry.createdAt.toISOString(),
      })),
      epic: mapTaskEpicSummary(task.epic),
      assignee: mapTaskPersonSummary(task.assigneeUser),
      createdBy: mapTaskPersonSummary(task.createdByUser)!,
      updatedBy: mapTaskPersonSummary(task.updatedByUser)!,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      archivedAt: task.archivedAt ? task.archivedAt.toISOString() : null,
      relatedTasks: [
        ...task.outgoingRelations.map((entry: OutgoingRelation) =>
          mapRelatedTaskSummary(entry.rightTask)
        ),
        ...task.incomingRelations.map((entry: IncomingRelation) =>
          mapRelatedTaskSummary(entry.leftTask)
        ),
      ].sort((left, right) => left.title.localeCompare(right.title)),
      status: task.status,
      attachments: task.attachments.map((attachment: TaskAttachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        url: attachment.url,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl:
          attachment.kind === ATTACHMENT_KIND_FILE
            ? `/api/projects/${projectId}/tasks/${task.id}/attachments/${attachment.id}/download`
            : null,
      })),
    };

    if (task.status === "Done" && task.archivedAt) {
      archivedDoneTasks.push(normalizedTask);
      return;
    }

    kanbanTasks.push(normalizedTask);
  });

  return (
    <KanbanBoard
      canEdit={canEdit}
      projectId={projectId}
      storageProvider={storageProvider}
      initialTasks={kanbanTasks}
      archivedDoneTasks={archivedDoneTasks}
      epics={epicOptions}
      collaborators={collaborators}
      actorUserId={actorUserId}
    />
  );
}

export function KanbanBoardSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns3 className="h-4 w-4" />
          Kanban board
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 py-5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40"
          />
        ))}
      </CardContent>
    </Card>
  );
}
