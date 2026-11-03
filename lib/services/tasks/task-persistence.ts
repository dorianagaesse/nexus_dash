import { buildCanonicalTaskRelation, mergeRelatedTaskSummaries } from "@/lib/task-related";
import { mapTaskEpicSummary } from "@/lib/epic";
import { getTaskLabelsFromStorage } from "@/lib/task-label";
import { formatTaskDeadlineDate } from "@/lib/task-deadline";
import { formatTaskReference } from "@/lib/task-reference";
import { taskPersonSummarySelect } from "@/lib/task-person";
import { mapTaskAuthorRecord } from "@/lib/task-author";
import type { DbClient } from "@/lib/services/rls-context";
import { loadProjectActorRegistry } from "@/lib/services/project-actor-service";
import { mapTaskStoredActor } from "@/lib/services/project-task-response";
import type { UpdatedTaskPayload } from "./task-types";

export const relatedTaskSummarySelect = {
  id: true,
  title: true,
  status: true,
  archivedAt: true,
} as const;

export async function loadTaskMutationPayload(
  db: DbClient,
  projectId: string,
  taskId: string,
  hasEpic = true
): Promise<UpdatedTaskPayload | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      contentRevision: true,
      referenceNumber: true,
      title: true,
      label: true,
      labelsJson: true,
      description: true,
      deadlineAt: true,
      _count: {
        select: {
          comments: true,
        },
      },
      blockedNote: true,
      status: true,
      position: true,
      completedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        where: { isCommentDraft: false },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          commentId: true,
          kind: true,
          name: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
      epic: hasEpic ? { select: { id: true, name: true } } : false,
      createdByCredentialId: true,
      createdByCredentialLabel: true,
      updatedByCredentialId: true,
      updatedByCredentialLabel: true,
      createdByUser: {
        select: taskPersonSummarySelect,
      },
      updatedByUser: {
        select: taskPersonSummarySelect,
      },
      assigneeKind: true,
      assigneeUserId: true,
      assigneeCredentialId: true,
      assigneeDisplayNameSnapshot: true,
      assigneeAssignedByKind: true,
      assigneeAssignedByUserId: true,
      assigneeAssignedByCredentialId: true,
      assigneeAssignedByDisplayNameSnapshot: true,
      assigneeAssignedAt: true,
      assigneeUser: {
        select: taskPersonSummarySelect,
      },
      assigneeAssignedByUser: {
        select: taskPersonSummarySelect,
      },
      outgoingRelations: {
        select: {
          rightTask: {
            select: relatedTaskSummarySelect,
          },
        },
      },
      incomingRelations: {
        select: {
          leftTask: {
            select: relatedTaskSummarySelect,
          },
        },
      },
      blockedFollowUps: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  if (!task) {
    return null;
  }

  const actorRegistry =
    task.assigneeKind || task.assigneeAssignedByKind
      ? await loadProjectActorRegistry({ db, projectId })
      : null;

  return {
    id: task.id,
    contentRevision: task.contentRevision,
    reference: formatTaskReference(task.referenceNumber),
    title: task.title,
    label: task.label,
    labelsJson: task.labelsJson,
    labels: getTaskLabelsFromStorage(task.labelsJson, task.label),
    description: task.description,
    deadlineDate: formatTaskDeadlineDate(task.deadlineAt),
    commentCount: task._count.comments,
    blockedNote: task.blockedNote,
    status: task.status,
    position: task.position,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    epic: mapTaskEpicSummary(task.epic ?? null),
    assignee: mapTaskStoredActor({
      kind: task.assigneeKind,
      userId: task.assigneeUserId,
      credentialId: task.assigneeCredentialId,
      displayNameSnapshot: task.assigneeDisplayNameSnapshot,
      user: task.assigneeUser,
      registry: actorRegistry,
    }),
    assignedBy: mapTaskStoredActor({
      kind: task.assigneeAssignedByKind,
      userId: task.assigneeAssignedByUserId,
      credentialId: task.assigneeAssignedByCredentialId,
      displayNameSnapshot: task.assigneeAssignedByDisplayNameSnapshot,
      user: task.assigneeAssignedByUser,
      registry: actorRegistry,
    }),
    assignedAt: task.assigneeAssignedAt,
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
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    relatedTasks: mergeRelatedTaskSummaries(task),
    blockedFollowUps: task.blockedFollowUps,
    attachments: task.attachments,
  };
}

export async function replaceTaskRelations(input: {
  db: DbClient;
  projectId: string;
  taskId: string;
  relatedTaskIds: string[];
  existingRelatedTaskIds?: string[];
}) {
  const existingIds = new Set(input.existingRelatedTaskIds ?? []);
  const requestedIds = new Set(input.relatedTaskIds);
  await editTaskRelationPairs({
    ...input,
    removeTaskIds: [...existingIds].filter((id) => !requestedIds.has(id)),
    addTaskIds: [...requestedIds].filter((id) => !existingIds.has(id)),
  });
}

export async function editTaskRelationPairs(input: {
  db: DbClient;
  projectId: string;
  taskId: string;
  addTaskIds: string[];
  removeTaskIds: string[];
}) {
  if (input.removeTaskIds.length > 0) {
    await input.db.taskRelation.deleteMany({
      where: {
        projectId: input.projectId,
        OR: input.removeTaskIds.map((relatedTaskId) =>
          buildCanonicalTaskRelation(input.taskId, relatedTaskId)
        ),
      },
    });
  }
  if (input.addTaskIds.length > 0) {
    await input.db.taskRelation.createMany({
      data: input.addTaskIds.map((relatedTaskId) => ({
        ...buildCanonicalTaskRelation(input.taskId, relatedTaskId),
        projectId: input.projectId,
      })),
      skipDuplicates: true,
    });
  }
}
