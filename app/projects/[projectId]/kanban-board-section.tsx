import { Columns3 } from "lucide-react";

import { CreateTaskDialog } from "@/components/create-task-dialog";
import { KanbanBoard, type KanbanTask } from "@/components/kanban-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectKanbanTasks } from "@/lib/services/project-service";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { isTaskStatus } from "@/lib/task-status";

interface KanbanBoardSectionProps {
  projectId: string;
  storageProvider: "local" | "r2";
}

export async function KanbanBoardSection({
  projectId,
  storageProvider,
}: KanbanBoardSectionProps) {
  const tasks = await listProjectKanbanTasks(projectId);
  const kanbanTasks: KanbanTask[] = [];
  const archivedDoneTasks: KanbanTask[] = [];
  const existingLabelSet = new Set<string>();

  tasks.forEach((task) => {
    if (!isTaskStatus(task.status)) {
      return;
    }

    const normalizedTask: KanbanTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
      blockedFollowUps: task.blockedFollowUps.map((entry) => ({
        id: entry.id,
        content: entry.content,
        createdAt: entry.createdAt.toISOString(),
      })),
      status: task.status,
      attachments: task.attachments.map((attachment) => ({
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

    normalizedTask.labels.forEach((label) => {
      existingLabelSet.add(label);
    });

    if (task.status === "Done" && task.archivedAt) {
      archivedDoneTasks.push(normalizedTask);
      return;
    }

    kanbanTasks.push(normalizedTask);
  });

  return (
    <KanbanBoard
      projectId={projectId}
      storageProvider={storageProvider}
      initialTasks={kanbanTasks}
      archivedDoneTasks={archivedDoneTasks}
      headerAction={
        <CreateTaskDialog
          projectId={projectId}
          storageProvider={storageProvider}
          existingLabels={Array.from(existingLabelSet)}
        />
      }
    />
  );
}

export function KanbanBoardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns3 className="h-4 w-4" />
          Kanban board
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-md border border-dashed border-muted-foreground/30 bg-muted/40"
          />
        ))}
      </CardContent>
    </Card>
  );
}
