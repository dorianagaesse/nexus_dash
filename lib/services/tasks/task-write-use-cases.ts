import { TASK_STATUSES } from "@/lib/task-status";
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
import type { ResolvedProjectActorPersistence } from "@/lib/services/project-actor-service";
import { editConflict, lockContentRevision } from "@/lib/services/content-revision-service";
import { isRetryableTransactionError, retryTransaction } from "@/lib/services/transaction-retry";
import {
  parseCreateTaskInput,
  parseUpdateTaskJsonInput,
  type UpdateTaskCommand,
  type UpdateTaskPayload,
} from "@/lib/task-contracts";
import type {
  ServiceResult,
  CreateTaskForProjectInput,
  UpdatedTaskPayload,
  TaskAssignmentProvenance,
} from "./task-types";
import { createError } from "./task-result";
import { normalizeText } from "./task-input";
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
import {
  insertTaskWithAttribution,
  persistTaskContentEdit,
  appendTaskAssignmentChange,
  appendTaskBlockedFollowUp,
  removeTaskWithDependents,
} from "./task-write-data";
import {
  loadTaskLaneTail,
  loadTaskEditState,
} from "./task-command-data";

export async function createTaskForProject(
  input: CreateTaskForProjectInput
): Promise<
  ServiceResult<{ task: UpdatedTaskPayload; activityVersion: Date }>
> {
  const actorUserId = normalizeText(input.actorUserId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }

  const parsedCreate = parseCreateTaskInput(input);
  if (!parsedCreate.ok) {
    return createError(
      parsedCreate.status,
      parsedCreate.error,
      parsedCreate.invalidRelatedTask
    );
  }
  const command = parsedCreate.data;
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
      capability: "task:write",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    try {
      const relatedTaskValidation = await validateRelatedTaskIds({
        db,
        projectId: input.projectId,
        relatedTaskIds: command.relatedTaskIds,
        agentAccess: input.agentAccess,
      });
      if (!relatedTaskValidation.ok) {
        return relatedTaskValidation;
      }

      let resolvedAssignee: ResolvedProjectActorPersistence | null = null;
      let assignmentActor: ResolvedProjectActorPersistence | null = null;
      let assignmentProvenance: TaskAssignmentProvenance | null = null;
      if (command.assignee) {
        const assigneeResolution = await resolveTaskAssigneeAssignment({
          db,
          projectId: input.projectId,
          reference: command.assignee,
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

      if (command.epicId && input.agentAccess && !input.agentAccess.scopes.includes("epic:read")) return createError(403, "forbidden");
      const epicValidation = await validateEpicId({
        db,
        projectId: input.projectId,
        epicId: command.epicId,
      });
      if (!epicValidation.ok) {
        return epicValidation;
      }

      const maxPosition = await loadTaskLaneTail(db, input.projectId, status, actorUserId);

      const nextPosition = (maxPosition ?? -1) + 1;

      const agentAttribution = await resolveTaskAgentAttribution({
        db,
        agentAccess: input.agentAccess,
      });

      const createdTask = await insertTaskWithAttribution(db, {
        projectId: input.projectId,
        title: command.title,
        description: command.normalizedDescription,
        deadlineAt: command.deadlineAt,
        epicId: epicValidation.data.epicId,
        label: command.labels[0] ?? null,
        labelsJson: command.serializedLabels,
        status,
        position: nextPosition,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        ...taskAgentAuthorWriteData(agentAttribution, "createdBy"),
        ...taskAgentAuthorWriteData(agentAttribution, "updatedBy"),
        ...buildTaskAssignmentWriteData(resolvedAssignee, assignmentProvenance),
      });

      createdTaskId = createdTask.id;

      if (resolvedAssignee && assignmentActor && assignmentProvenance) {
        await appendTaskAssignmentChange(db, buildTaskAssigneeChangeData({
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
        }));
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
        links: command.attachmentLinks,
        files: command.attachmentFiles,
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
        Boolean(epicValidation.data.epicId) && (!input.agentAccess || input.agentAccess.scopes.includes("epic:read"))
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
        await removeTaskWithDependents(db, createdTaskId)
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
  payload: UpdateTaskPayload | UpdateTaskCommand,
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

  const parsedBeforeAuth = parseUpdateTaskJsonInput(payload, {
    taskId,
    validateTitleLength: false,
  });
  if (!parsedBeforeAuth.ok) {
    return createError(
      parsedBeforeAuth.status,
      parsedBeforeAuth.error,
      parsedBeforeAuth.invalidRelatedTask
    );
  }

  const agentScopeAccess = requireAgentProjectScopes({
    agentAccess,
    projectId,
    requiredScopes: ["task:write"],
  });
  if (!agentScopeAccess.ok) {
    return createError(agentScopeAccess.status, agentScopeAccess.error);
  }

  const parsedUpdate = parseUpdateTaskJsonInput(parsedBeforeAuth.data, {
    taskId,
    validateTitleLength: true,
  });
  if (!parsedUpdate.ok) {
    return createError(
      parsedUpdate.status,
      parsedUpdate.error,
      parsedUpdate.invalidRelatedTask
    );
  }

  const command = parsedUpdate.data;
  const titleProvided = command.title !== undefined;
  const title = command.title ?? "";
  const labelsProvided = command.labels !== undefined;
  const normalizedLabels = command.labels?.labels ?? [];
  const serializedLabels = command.labels?.serializedLabels ?? null;
  const descriptionProvided = command.description !== undefined;
  const description = command.description ?? null;
  const deadlineProvided = command.deadline !== undefined;
  const deadlineAt = command.deadline?.deadlineAt ?? null;
  const blockedFollowUpEntry = command.blockedFollowUpEntry ?? "";
  const relatedTaskIdsProvided = command.relatedTasks.mode === "replace";
  const relatedTaskIds =
    command.relatedTasks.mode === "replace"
      ? command.relatedTasks.relatedTaskIds
      : [];
  const additiveRelationsProvided = command.relatedTasks.mode === "patch";
  const addRelatedTaskIds =
    command.relatedTasks.mode === "patch"
      ? command.relatedTasks.addRelatedTaskIds
      : [];
  const removeRelatedTaskIds =
    command.relatedTasks.mode === "patch"
      ? command.relatedTasks.removeRelatedTaskIds
      : [];
  const loadExistingRelations =
    relatedTaskIdsProvided || addRelatedTaskIds.length > 0;
  const epicProvided = command.epicId !== undefined;
  const epicId = command.epicId ?? null;
  const assigneeProvided = command.assignee !== undefined;
  const assigneeReference = command.assignee ?? null;
  const parsedAttachmentLinks = command.attachmentLinks;

  const update = () => withActorRlsContext<
    ServiceResult<{ task: UpdatedTaskPayload; activityVersion: Date }>
  >(normalizedActorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId: normalizedActorUserId,
      projectId,
      minimumRole: "editor",
      capability: "task:write",
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
        const current = await loadTaskMutationPayload(db, projectId, taskId, !agentAccess || agentAccess.scopes.includes("epic:read"));
        if (!current) return createError(404, "Task not found");
        return editConflict({
          ...current,
          attachments: current.attachments.map((attachment) =>
            mapTaskAttachmentResponse(projectId, taskId, attachment)
          ),
        });
      }
      const existingTask = await loadTaskEditState(db, taskId, loadExistingRelations);

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

      if (epicProvided && epicId && agentAccess && !agentAccess.scopes.includes("epic:read")) return createError(403, "forbidden");
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

        await persistTaskContentEdit(tx, taskId, {
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
          ...(deadlineProvided
            ? { deadlineAt }
            : {}),
        });

        if (parsedAttachmentLinks && parsedAttachmentLinks.length > 0) {
          await createTaskAttachmentsFromDraft({
            actorUserId: normalizedActorUserId,
            projectId,
            taskId,
            links: parsedAttachmentLinks,
            files: [],
            db: tx,
          });
        }

        if (blockedFollowUpEntry.length > 0 && existingTask.status === "Blocked") {
          await appendTaskBlockedFollowUp(tx, {
            taskId,
            content: blockedFollowUpEntry,
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
          await appendTaskAssignmentChange(tx, pendingAssigneeChange);
        }

        return loadTaskMutationPayload(
          tx,
          projectId,
          taskId,
          Boolean(epicValidation.data.epicId) && (!agentAccess || agentAccess.scopes.includes("epic:read"))
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
