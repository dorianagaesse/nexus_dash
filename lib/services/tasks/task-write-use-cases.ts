import { sanitizeRichText } from "@/lib/rich-text";
import { normalizeRelatedTaskIds } from "@/lib/task-related";
import { normalizeTaskLabels, parseTaskLabelsJson, serializeTaskLabels } from "@/lib/task-label";
import { TASK_STATUSES } from "@/lib/task-status";
import {
  parseAttachmentLinksJson,
  validateAttachmentFiles,
} from "@/lib/services/attachment-input-service";
import { logServerError } from "@/lib/observability/logger";
import { recordProjectActivityEvent } from "@/lib/services/project-activity-service";
import {
  createTaskAttachmentsFromDraft,
  mapTaskAttachmentResponse,
} from "@/lib/services/project-attachment-service";
import {
  requireAgentProjectScopes,
  requireProjectRole,
  type AgentProjectAccessContext,
} from "@/lib/services/project-access-service";
import { resolveTaskAssignmentNotifications } from "@/lib/services/notification-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import { MAX_TASK_TITLE_LENGTH } from "@/lib/task-title";
import { isProjectActorReference, type ProjectActorReference } from "@/lib/project-actor";
import type { ResolvedProjectActorPersistence } from "@/lib/services/project-actor-service";
import { editConflict, lockContentRevision } from "@/lib/services/content-revision-service";
import { isRetryableTransactionError, retryTransaction } from "@/lib/services/transaction-retry";
import type {
  ServiceResult,
  UpdateTaskPayload,
  CreateTaskForProjectInput,
  UpdatedTaskPayload,
  TaskAssignmentProvenance,
} from "./task-types";
import { createError } from "./task-result";
import {
  MIN_TITLE_LENGTH,
  TASK_ASSIGNEE_INVALID,
  normalizeText,
  serializeJsonFieldValue,
  parseDeadlineInput,
  parseRelatedTaskIdsJson,
} from "./task-input";
import { validateRelatedTaskIds, validateEpicId } from "./task-policy";
import {
  resolveTaskAssigneeAssignment,
  resolveTaskMutationActorSnapshot,
  isSameStoredTaskAssignee,
  buildTaskAssignmentWriteData,
  buildTaskAssigneeChangeData,
  resolveTaskAgentAttribution,
  taskAgentAuthorWriteData,
  shouldNotifyAssignee,
  buildTaskAssignmentNotification,
  dispatchTaskAssignmentNotification,
} from "./task-assignment";
import {
  loadTaskMutationPayload,
  replaceTaskRelations,
  editTaskRelationPairs,
} from "./task-persistence";

export async function createTaskForProject(
  input: CreateTaskForProjectInput
): Promise<
  ServiceResult<{ task: UpdatedTaskPayload; activityVersion: Date }>
> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const title = normalizeText(input.title);
  if (title.length < MIN_TITLE_LENGTH) {
    return createError(400, "title-too-short");
  }
  if (title.length > MAX_TASK_TITLE_LENGTH) {
    return createError(400, "title-too-long");
  }

  const parsedLinks = parseAttachmentLinksJson(input.attachmentLinksJsonRaw);
  if (parsedLinks.error) {
    return createError(400, parsedLinks.error);
  }

  const parsedRelatedTaskIds = parseRelatedTaskIdsJson(input.relatedTaskIdsJsonRaw);
  if (parsedRelatedTaskIds === null) {
    return createError(400, "related-tasks-invalid");
  }

  const attachmentFileError = validateAttachmentFiles(input.attachmentFiles);
  if (attachmentFileError) {
    return createError(400, attachmentFileError);
  }

  const labels = parseTaskLabelsJson(input.labelsJsonRaw);
  const serializedLabels = serializeTaskLabels(labels);
  const description = sanitizeRichText(normalizeText(input.description));
  const deadlineInput = parseDeadlineInput(input.deadlineDate);
  if (!deadlineInput.ok) {
    return deadlineInput;
  }
  const status = TASK_STATUSES[0];
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess: input.agentAccess,
    projectId: input.projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  let createdTaskId: string | null = null;

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const relatedTaskValidation = await validateRelatedTaskIds({
        db,
        projectId: input.projectId,
        relatedTaskIds: parsedRelatedTaskIds,
        agentAccess: input.agentAccess,
      });
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      let resolvedAssignee: ResolvedProjectActorPersistence | null = null;
      let assignmentActor: ResolvedProjectActorPersistence | null = null;
      let assignmentProvenance: TaskAssignmentProvenance | null = null;
      if (input.assignee) {
        const assigneeResolution = await resolveTaskAssigneeAssignment({
          db,
          projectId: input.projectId,
          reference: input.assignee,
        });
        if (!assigneeResolution.ok) {
          return assigneeResolution;
        }
        resolvedAssignee = assigneeResolution.data;

        const mutationActor = await resolveTaskMutationActorSnapshot({
          db,
          actorUserId,
          projectId: input.projectId,
          agentAccess: input.agentAccess,
        });
        if (!mutationActor.ok) {
          return mutationActor;
        }
        assignmentActor = mutationActor.data;
        assignmentProvenance = {
          kind: assignmentActor.summary.kind,
          userId: assignmentActor.userId,
          credentialId: assignmentActor.credentialId,
          displayNameSnapshot: assignmentActor.displayNameSnapshot,
          assignedAt: new Date(),
        };
      }

      const epicValidation = await validateEpicId({
        db,
        projectId: input.projectId,
        epicId: input.epicId,
      });
      if (!epicValidation.ok) {
        return epicValidation;
      }

      const maxPosition = await db.task.aggregate({
        where: {
          projectId: input.projectId,
          status,
          project: {
            OR: [
              { ownerId: actorUserId },
              { memberships: { some: { userId: actorUserId } } },
            ],
          },
        },
        _max: { position: true },
      });

      const nextPosition = (maxPosition._max.position ?? -1) + 1;

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess: input.agentAccess,
      });

      const createdTask = await db.task.create({
        data: {
          projectId: input.projectId,
          title,
          description,
          deadlineAt: deadlineInput.data.deadlineAt,
          epicId: epicValidation.data.epicId,
          label: labels[0] ?? null,
          labelsJson: serializedLabels,
          status,
          position: nextPosition,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          ...taskAgentAuthorWriteData(agentAttribution, "createdBy"),
          ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
          ...buildTaskAssignmentWriteData(resolvedAssignee, assignmentProvenance),
        },
        select: { id: true },
      });

      createdTaskId = createdTask.id;

      if (resolvedAssignee && assignmentActor && assignmentProvenance) {
        await db.taskAssigneeChange.create({
          data: buildTaskAssigneeChangeData({
            taskId: createdTask.id,
            previous: {
              assigneeKind: null,
              assigneeUserId: null,
              assigneeCredentialId: null,
              assigneeDisplayNameSnapshot: null,
            },
            next: resolvedAssignee,
            changedBy: assignmentActor,
            changedAt: assignmentProvenance.assignedAt,
          }),
        });
      }

      if (relatedTaskValidation.data.relatedTaskIds.length > 0) {
        await replaceTaskRelations({
          db,
          projectId: input.projectId,
          taskId: createdTask.id,
          relatedTaskIds: relatedTaskValidation.data.relatedTaskIds,
        });
      }

      await createTaskAttachmentsFromDraft({
        actorUserId,
        projectId: input.projectId,
        taskId: createdTask.id,
        links: parsedLinks.links,
        files: input.attachmentFiles,
        db,
      });

      const createdAssigneeUserId =
        resolvedAssignee?.summary.kind === "human" ? resolvedAssignee.userId : null;
      if (
        createdAssigneeUserId &&
        shouldNotifyAssignee({
          actorUserId,
          assigneeUserId: createdAssigneeUserId,
          agentAccess: input.agentAccess,
        })
      ) {
        await dispatchTaskAssignmentNotification({
          db,
          pendingNotification: await buildTaskAssignmentNotification({
            db,
            projectId: input.projectId,
            taskId: createdTask.id,
            actorUserId,
            assigneeUserId: createdAssigneeUserId,
            agentAccess: input.agentAccess,
          }),
        });
      }

      const task = await loadTaskMutationPayload(
        db,
        input.projectId,
        createdTask.id,
        Boolean(epicValidation.data.epicId)
      );
      if (!task) {
        return createError(500, "create-failed");
      }

      const activityVersion = new Date();
      await recordProjectActivityEvent({
        db,
        projectId: input.projectId,
        actorUserId,
        domain: "task",
        action: "created",
        entityId: task.id,
        payload: {
          task: {
            ...task,
            attachments: Array.isArray(task.attachments)
              ? task.attachments.map((attachment) =>
                  mapTaskAttachmentResponse(input.projectId, task.id, attachment)
                )
              : task.attachments,
          },
        },
        occurredAt: activityVersion,
      });

      return {
        ok: true,
        data: {
          task,
          activityVersion,
        },
      };
    } catch (error) {
      if (createdTaskId) {
        await db.task
          .delete({
            where: { id: createdTaskId },
          })
          .catch((cleanupError) => {
            logServerError("createTaskForProject.cleanup", cleanupError);
          });
      }

      logServerError("createTaskForProject", error);
      return createError(500, "create-failed");
    }
  });
}

export async function updateTaskForProject(
  projectId: string,
  taskId: string,
  payload: UpdateTaskPayload,
  actorUserId: string,
  agentAccess?: AgentProjectAccessContext,
  expectedRevision?: number
): Promise<
  ServiceResult<{ task: UpdatedTaskPayload; activityVersion: Date }>
> {
  const normalizedActorUserId = normalizeText(actorUserId);
  if (!normalizedActorUserId) {
    return createError(401, "unauthorized");
  }

  const titleProvided = Object.prototype.hasOwnProperty.call(payload, "title");
  const title = normalizeText(payload.title);
  const labelsProvided =
    Object.prototype.hasOwnProperty.call(payload, "labels") ||
    Object.prototype.hasOwnProperty.call(payload, "label");
  const rawLabels =
    Array.isArray(payload.labels) && payload.labels.length > 0
      ? payload.labels
      : [normalizeText(payload.label)];
  const labels = rawLabels.map((entry) => normalizeText(entry)).filter(Boolean);
  const normalizedLabels = normalizeTaskLabels(labels);
  const serializedLabels = serializeTaskLabels(normalizedLabels);
  const descriptionProvided = Object.prototype.hasOwnProperty.call(payload, "description");
  const description = sanitizeRichText(normalizeText(payload.description));
  const deadlineInput = parseDeadlineInput(payload.deadlineDate, {
    preserveWhenMissing: true,
  });
  if (!deadlineInput.ok) {
    return deadlineInput;
  }
  const blockedFollowUpEntry = normalizeText(payload.blockedFollowUpEntry);
  const relatedTaskIdsProvided = Object.prototype.hasOwnProperty.call(payload, "relatedTaskIds");
  const relatedTaskIds = relatedTaskIdsProvided
    ? normalizeRelatedTaskIds(payload.relatedTaskIds ?? [])
    : [];
  const additiveRelationsProvided =
    Object.prototype.hasOwnProperty.call(payload, "addRelatedTaskIds") ||
    Object.prototype.hasOwnProperty.call(payload, "removeRelatedTaskIds");
  if (relatedTaskIdsProvided && additiveRelationsProvided) {
    return createError(400, "related-tasks-mode-conflict");
  }
  for (const field of ["addRelatedTaskIds", "removeRelatedTaskIds"] as const) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      (!Array.isArray(payload[field]) ||
        payload[field].some((id) => typeof id !== "string" || !id.trim()))
    ) {
      return createError(400, "related-tasks-invalid");
    }
  }
  const addRelatedTaskIds = normalizeRelatedTaskIds(payload.addRelatedTaskIds ?? []);
  const removeRelatedTaskIds = normalizeRelatedTaskIds(payload.removeRelatedTaskIds ?? []);
  if (addRelatedTaskIds.some((id) => removeRelatedTaskIds.includes(id))) {
    return createError(400, "related-tasks-operation-conflict");
  }
  if (removeRelatedTaskIds.includes(taskId)) {
    return createError(400, "related-tasks-invalid", { id: taskId, reason: "self" });
  }
  const loadExistingRelations = relatedTaskIdsProvided || addRelatedTaskIds.length > 0;
  const epicProvided = Object.prototype.hasOwnProperty.call(payload, "epicId");
  const epicId = epicProvided ? normalizeText(payload.epicId) : null;
  // Transport precedence: the structured `assignee` reference wins over the
  // legacy human-only `assigneeUserId` shorthand when both are present.
  const assigneeReferenceProvided =
    Object.prototype.hasOwnProperty.call(payload, "assignee") &&
    payload.assignee !== undefined;
  let assigneeReference: ProjectActorReference | null = null;
  if (assigneeReferenceProvided) {
    if (payload.assignee === null) {
      assigneeReference = null;
    } else if (isProjectActorReference(payload.assignee)) {
      assigneeReference = {
        kind: payload.assignee.kind,
        id: payload.assignee.id.trim(),
      };
    } else {
      return createError(400, TASK_ASSIGNEE_INVALID);
    }
  } else if (Object.prototype.hasOwnProperty.call(payload, "assigneeUserId")) {
    const legacyAssigneeUserId = normalizeText(payload.assigneeUserId);
    assigneeReference = legacyAssigneeUserId
      ? { kind: "human", id: legacyAssigneeUserId }
      : null;
  }
  const assigneeProvided =
    assigneeReferenceProvided ||
    Object.prototype.hasOwnProperty.call(payload, "assigneeUserId");
  const attachmentLinksProvided = Object.prototype.hasOwnProperty.call(
    payload,
    "attachmentLinks"
  );
  const parsedAttachmentLinks = attachmentLinksProvided
    ? parseAttachmentLinksJson(serializeJsonFieldValue(payload.attachmentLinks))
    : null;
  if (parsedAttachmentLinks?.error) {
    return createError(400, parsedAttachmentLinks.error);
  }
  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  if (titleProvided && title.length < MIN_TITLE_LENGTH) {
    return createError(400, "Task title must be at least 2 characters");
  }
  if (titleProvided && title.length > MAX_TASK_TITLE_LENGTH) {
    return createError(400, "title-too-long");
  }

  const update = () => withActorRlsContext<
    ServiceResult<{ task: UpdatedTaskPayload; activityVersion: Date }>
  >(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const precondition = await lockContentRevision({
        db, domain: "task", projectId, id: taskId, expectedRevision,
      });
      if (precondition === "missing") return createError(404, "Task not found");
      if (precondition === "conflict") {
        const current = await loadTaskMutationPayload(db, projectId, taskId, true);
        if (!current) return createError(404, "Task not found");
        return editConflict({
          ...current,
          attachments: current.attachments.map((attachment) =>
            mapTaskAttachmentResponse(projectId, taskId, attachment)
          ),
        });
      }
      const existingTask = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          projectId: true,
          status: true,
          position: true,
          epicId: true,
          assigneeKind: true,
          assigneeUserId: true,
          assigneeCredentialId: true,
          assigneeDisplayNameSnapshot: true,
          outgoingRelations: loadExistingRelations
            ? { select: { rightTaskId: true } }
            : false,
          incomingRelations: loadExistingRelations
            ? { select: { leftTaskId: true } }
            : false,
        },
      });

      if (!existingTask || existingTask.projectId !== projectId) {
        return createError(404, "Task not found");
      }

      const existingRelatedTaskIds = loadExistingRelations
        ? [
            ...existingTask.outgoingRelations.map((entry) => entry.rightTaskId),
            ...existingTask.incomingRelations.map((entry) => entry.leftTaskId),
          ]
        : [];
      const relatedTaskValidation = loadExistingRelations
        ? await validateRelatedTaskIds({
            db,
            projectId,
            taskId,
            relatedTaskIds: relatedTaskIdsProvided ? relatedTaskIds : addRelatedTaskIds,
            allowArchivedTaskIds: existingRelatedTaskIds,
            agentAccess,
          })
        : {
            ok: true as const,
            data: {
              relatedTaskIds: [],
            },
          };
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      const epicValidation = epicProvided
        ? await validateEpicId({
            db,
            projectId,
            epicId: epicId || null,
          })
        : {
            ok: true as const,
            data: {
              epicId: existingTask.epicId,
            },
          };
      if (!epicValidation.ok) {
        return epicValidation;
      }

      let nextAssignment: ResolvedProjectActorPersistence | null = null;
      if (assigneeProvided && assigneeReference) {
        const assigneeResolution = await resolveTaskAssigneeAssignment({
          db,
          projectId,
          reference: assigneeReference,
        });
        if (!assigneeResolution.ok) {
          return assigneeResolution;
        }
        nextAssignment = assigneeResolution.data;
      }

      const assignmentChanged =
        assigneeProvided &&
        !isSameStoredTaskAssignee({
          existing: existingTask,
          next: nextAssignment,
        });

      let assignmentWriteData: ReturnType<
        typeof buildTaskAssignmentWriteData
      > | null = null;
      let pendingAssigneeChange: ReturnType<
        typeof buildTaskAssigneeChangeData
      > | null = null;
      if (assignmentChanged) {
        const mutationActor = await resolveTaskMutationActorSnapshot({
          db,
          actorUserId: normalizedActorUserId,
          projectId,
          agentAccess,
        });
        if (!mutationActor.ok) {
          return mutationActor;
        }

        const assignedAt = new Date();
        assignmentWriteData = buildTaskAssignmentWriteData(nextAssignment, {
          kind: mutationActor.data.summary.kind,
          userId: mutationActor.data.userId,
          credentialId: mutationActor.data.credentialId,
          displayNameSnapshot: mutationActor.data.displayNameSnapshot,
          assignedAt,
        });
        pendingAssigneeChange = buildTaskAssigneeChangeData({
          taskId,
          previous: existingTask,
          next: nextAssignment,
          changedBy: mutationActor.data,
          changedAt: assignedAt,
        });
      }

      const updateWithClient = async (tx: typeof db) => {
        const agentAttribution = await resolveTaskAgentAttribution({
          db: tx,
          agentAccess,
        });

        await tx.task.update({
          where: { id: taskId },
          data: {
            updatedByUserId: normalizedActorUserId,
            ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
            epicId: epicValidation.data.epicId,
            ...(assignmentWriteData ?? {}),
            ...(titleProvided ? { title } : {}),
            ...(labelsProvided
              ? {
                  label: normalizedLabels[0] ?? null,
                  labelsJson: serializedLabels,
                }
              : {}),
            ...(descriptionProvided ? { description } : {}),
            ...(deadlineInput.data.provided
              ? { deadlineAt: deadlineInput.data.deadlineAt }
              : {}),
          },
        });

        if (parsedAttachmentLinks && parsedAttachmentLinks.links.length > 0) {
          await createTaskAttachmentsFromDraft({
            actorUserId: normalizedActorUserId,
            projectId,
            taskId,
            links: parsedAttachmentLinks.links,
            files: [],
            db: tx,
          });
        }

        if (blockedFollowUpEntry.length > 0 && existingTask.status === "Blocked") {
          await tx.taskBlockedFollowUp.create({
            data: {
              taskId,
              content: blockedFollowUpEntry,
            },
          });
        }

        if (relatedTaskIdsProvided) {
          await replaceTaskRelations({
            db: tx,
            projectId,
            taskId,
            relatedTaskIds: relatedTaskValidation.data.relatedTaskIds,
            existingRelatedTaskIds,
          });
        } else if (additiveRelationsProvided) {
          await editTaskRelationPairs({
            db: tx,
            projectId,
            taskId,
            addTaskIds: relatedTaskValidation.data.relatedTaskIds,
            removeTaskIds: removeRelatedTaskIds,
          });
        }

        if (pendingAssigneeChange) {
          await tx.taskAssigneeChange.create({
            data: pendingAssigneeChange,
          });
        }

        return loadTaskMutationPayload(
          tx,
          projectId,
          taskId,
          Boolean(epicValidation.data.epicId)
        );
      };

      const updatedTask = await updateWithClient(db);

      if (!updatedTask) {
        return createError(404, "Task not found");
      }

      const previousAssigneeUserId =
        existingTask.assigneeKind === "human" ? existingTask.assigneeUserId : null;
      const updatedAssigneeUserId =
        nextAssignment?.summary.kind === "human" ? nextAssignment.userId : null;
      if (
        assignmentChanged &&
        previousAssigneeUserId &&
        previousAssigneeUserId !== updatedAssigneeUserId
      ) {
        await resolveTaskAssignmentNotifications({
          db,
          taskIds: [taskId],
          recipientUserId: previousAssigneeUserId,
        });
      }

      if (
        assignmentChanged &&
        previousAssigneeUserId !== updatedAssigneeUserId &&
        updatedAssigneeUserId &&
        shouldNotifyAssignee({
          actorUserId: normalizedActorUserId,
          assigneeUserId: updatedAssigneeUserId,
          agentAccess,
        })
      ) {
        await dispatchTaskAssignmentNotification({
          db,
          pendingNotification: await buildTaskAssignmentNotification({
            db,
            projectId,
            taskId,
            actorUserId: normalizedActorUserId,
            assigneeUserId: updatedAssigneeUserId,
            agentAccess,
          }),
        });
      }

      const activityVersion = new Date();
      await recordProjectActivityEvent({
        db,
        projectId,
        actorUserId: normalizedActorUserId,
        domain: "task",
        action: "updated",
        entityId: taskId,
        payload: {
          task: {
            ...updatedTask,
            attachments: Array.isArray(updatedTask.attachments)
              ? updatedTask.attachments.map((attachment) =>
                  mapTaskAttachmentResponse(projectId, taskId, attachment)
                )
              : updatedTask.attachments,
          },
        },
        occurredAt: activityVersion,
      });

      return {
        ok: true,
        data: {
          task: updatedTask,
          activityVersion,
        },
      };
    } catch (error) {
      if (expectedRevision !== undefined && isRetryableTransactionError(error)) {
        throw error;
      }
      logServerError("updateTaskForProject", error);
      return createError(500, "Failed to update task");
    }
  }, { forceTransaction: expectedRevision !== undefined });
  try {
    return await retryTransaction(update, expectedRevision !== undefined);
  } catch (error) {
    logServerError("updateTaskForProject", error);
    return createError(500, "Failed to update task");
  }
}
