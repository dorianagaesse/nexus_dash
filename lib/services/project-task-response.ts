import { mapTaskEpicSummary, type TaskEpicSummary } from "@/lib/epic";
import {
  mapTaskAttachmentResponse,
  type AttachmentResponsePayload,
} from "@/lib/services/project-attachment-service";
import type { ProjectKanbanTaskRecord } from "@/lib/services/project-service";
import { mapTaskAuthorRecord, type TaskAuthorSummary } from "@/lib/task-author";
import { formatTaskDeadlineDate } from "@/lib/task-deadline";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { mapTaskPersonSummary, type TaskPersonSummary } from "@/lib/task-person";
import { formatTaskReference } from "@/lib/task-reference";
import {
  mergeRelatedTaskSummaries,
  type RelatedTaskSummary,
} from "@/lib/task-related";

export interface TaskResponseRecord {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  blockedNote: string | null;
  deadlineDate: string | null;
  commentCount: number;
  completedAt: Date | null;
  archivedAt: Date | null;
  status: string;
  position: number;
  label: string | null;
  labelsJson: string | null;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  epic: TaskEpicSummary | null;
  assignee: TaskPersonSummary | null;
  createdBy: TaskAuthorSummary;
  updatedBy: TaskAuthorSummary;
  attachments: AttachmentResponsePayload[];
  relatedTasks: RelatedTaskSummary[];
  blockedFollowUps: ProjectKanbanTaskRecord["blockedFollowUps"];
}

export function mapProjectKanbanTaskToTaskResponse(
  task: ProjectKanbanTaskRecord,
  projectId: string
): TaskResponseRecord {
  return {
    id: task.id,
    reference: formatTaskReference(task.referenceNumber),
    title: task.title,
    description: task.description,
    blockedNote: task.blockedNote,
    deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
    commentCount: task._count.comments,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    status: task.status,
    position: task.position,
    label: task.label,
    labelsJson: task.labelsJson,
    labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    epic: mapTaskEpicSummary(task.epic),
    assignee: mapTaskPersonSummary(task.assigneeUser),
    createdBy: mapTaskAuthorRecord({
      author: task.createdByUser,
      agentCredentialId: task.createdByCredentialId,
      agentCredentialLabel: task.createdByCredentialLabel,
    }),
    updatedBy: mapTaskAuthorRecord({
      author: task.updatedByUser,
      agentCredentialId: task.updatedByCredentialId,
      agentCredentialLabel: task.updatedByCredentialLabel,
    }),
    attachments: task.attachments.map((attachment) =>
      mapTaskAttachmentResponse(projectId, task.id, attachment)
    ),
    relatedTasks: mergeRelatedTaskSummaries(task),
    blockedFollowUps: task.blockedFollowUps,
  };
}
